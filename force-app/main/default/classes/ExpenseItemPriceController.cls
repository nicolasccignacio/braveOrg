public without sharing class ExpenseItemPriceController {
    public class CreateInput {
        @AuraEnabled public String itemId;
        @AuraEnabled public String itemText; // if provided and not a valid Id, we will not set lookup
        @AuraEnabled public Decimal price;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Date expenseDate;
        @AuraEnabled public Integer cuotas;
        @AuraEnabled public String referencia;
    }
    public class CreateResult {
        @AuraEnabled public Id id;
        @AuraEnabled public String message;
    }

    // Lightweight DTO for Item search results
    public class ItemOption {
        @AuraEnabled public Id id;
        @AuraEnabled public String label;
        @AuraEnabled public String subtitle;
    }

    // Report data wrapper classes
    public class ReportDataWrapper {
        @AuraEnabled public String reportId;
        @AuraEnabled public String reportName;
        @AuraEnabled public List<ReportColumn> columns;
        @AuraEnabled public List<Map<String, Object>> rows;
        @AuraEnabled public Boolean hasData;
        @AuraEnabled public String errorMessage;
    }

    public class ReportColumn {
        @AuraEnabled public String label;
        @AuraEnabled public String fieldName;
        @AuraEnabled public String type;
    }

    @AuraEnabled(cacheable=true)
    public static List<ItemOption> searchItems(String term, Integer limitSize) {

        String q = String.valueOf(term == null ? '' : term).trim();
        Integer lim = (limitSize == null || limitSize <= 0 || limitSize > 50) ? 20 : limitSize;

        // Simple contains match on Name; adjust/add fields as needed
        List<Item__c> rows;
        if (String.isBlank(q)) {
            rows = [
                SELECT Id, Name
                FROM Item__c
                ORDER BY Name
                LIMIT :lim
            ];
        } else {
            String likeExpr = '%' + q + '%';
            rows = [
                SELECT Id, Name
                FROM Item__c
                WHERE Name LIKE :likeExpr
                ORDER BY Name
                LIMIT :lim
            ];
        }

        List<ItemOption> out = new List<ItemOption>();
        for (Item__c r : rows) {
            ItemOption o = new ItemOption();
            o.id = r.Id;
            o.label = r.Name;
            o.subtitle = String.valueOf(r.Id);
            out.add(o);
        }
        return out;
    }

    @AuraEnabled
    public static CreateResult createExpenseItemPrice(String input) {
        system.debug('input: ' + input);
        CreateInput inputObj = (CreateInput) JSON.deserialize(input, CreateInput.class);
        Expense_Item_Price__c rec = new Expense_Item_Price__c();

        rec.Item__c = inputObj.itemId;
        rec.Price__c = inputObj.price;
        rec.Quantity__c = inputObj.quantity;
        rec.Expense_Date__c = inputObj.expenseDate;
        rec.Cuotas__c = inputObj.cuotas;
        rec.Referencia__c = inputObj.referencia;

        insert rec;
        CreateResult result = new CreateResult();
        result.id = rec.Id;
        result.message = 'Created';
        return result;
    }

    /**
     * Fetches report data using Reports API for guest user access
     * @param reportId The Salesforce Report ID
     * @return ReportDataWrapper containing columns and rows
     */
    @AuraEnabled(cacheable=true)
    public static ReportDataWrapper getReportData(String reportId) {
        ReportDataWrapper wrapper = new ReportDataWrapper();
        wrapper.reportId = reportId;
        wrapper.hasData = false;
        wrapper.columns = new List<ReportColumn>();
        wrapper.rows = new List<Map<String, Object>>();

        try {
            if (String.isBlank(reportId)) {
                wrapper.errorMessage = 'Report ID is required';
                return wrapper;
            }

            // Run the report synchronously
            Reports.ReportResults reportResults = Reports.ReportManager.runReport(reportId, true);
            
            if (reportResults == null) {
                wrapper.errorMessage = 'Report not found or inaccessible';
                return wrapper;
            }

            // Get report metadata
            Reports.ReportMetadata reportMetadata = reportResults.getReportMetadata();
            wrapper.reportName = reportMetadata.getName();

            // Extract column information
            Reports.ReportExtendedMetadata extendedMetadata = reportResults.getReportExtendedMetadata();
            Map<String, Reports.DetailColumn> detailColumnMap = extendedMetadata.getDetailColumnInfo();
            
            List<String> columnKeys = new List<String>(detailColumnMap.keySet());
            columnKeys.sort(); // Sort to maintain consistent column order

            for (String columnKey : columnKeys) {
                Reports.DetailColumn detailCol = detailColumnMap.get(columnKey);
                ReportColumn col = new ReportColumn();
                col.label = detailCol.getLabel();
                col.fieldName = columnKey;
                col.type = String.valueOf(detailCol.getDataType());
                wrapper.columns.add(col);
            }

            // Extract fact map data (report rows)
            // Use Object type since Reports.FactMap is abstract
            Map<String, Object> factMapMap = (Map<String, Object>) reportResults.getFactMap();
            
            // Try common fact map keys: T!T (tabular), T!C (summary), etc.
            if (factMapMap != null && factMapMap.containsKey('T!T')) {
                // Use Object as intermediate type to avoid compile-time type checking
                Object factMapObj = factMapMap.get('T!T');
                try {
                    Reports.ReportFactWithDetails factDetails = (Reports.ReportFactWithDetails) factMapObj;
                    List<Reports.ReportDetailRow> detailRows = factDetails.getRows();

                    if (detailRows != null) {
                        for (Reports.ReportDetailRow detailRow : detailRows) {
                            Map<String, Object> row = new Map<String, Object>();
                            List<Reports.ReportDataCell> dataCells = detailRow.getDataCells();
                            
                            if (dataCells != null) {
                                for (Integer i = 0; i < dataCells.size() && i < columnKeys.size(); i++) {
                                    Reports.ReportDataCell cell = dataCells[i];
                                    String columnKey = columnKeys[i];
                                    Object cellValue = cell != null ? cell.getValue() : null;
                                    row.put(columnKey, cellValue);
                                    // Also add by label for easier access
                                    if (i < wrapper.columns.size()) {
                                        row.put(wrapper.columns[i].label, cellValue);
                                    }
                                }
                            }
                            wrapper.rows.add(row);
                        }
                    }
                } catch (TypeException e) {
                    // Handle other fact map types (e.g., summary reports)
                    wrapper.errorMessage = 'Report type not fully supported. Please use a Tabular report.';
                    System.debug('Report type casting error: ' + e.getMessage());
                }
            } else if (factMapMap != null && !factMapMap.isEmpty()) {
                // Try to get the first available fact map
                for (String key : factMapMap.keySet()) {
                    Object factMapObj = factMapMap.get(key);
                    try {
                        Reports.ReportFactWithDetails factDetails = (Reports.ReportFactWithDetails) factMapObj;
                        List<Reports.ReportDetailRow> detailRows = factDetails.getRows();

                        if (detailRows != null) {
                            for (Reports.ReportDetailRow detailRow : detailRows) {
                                Map<String, Object> row = new Map<String, Object>();
                                List<Reports.ReportDataCell> dataCells = detailRow.getDataCells();
                                
                                if (dataCells != null) {
                                    for (Integer i = 0; i < dataCells.size() && i < columnKeys.size(); i++) {
                                        Reports.ReportDataCell cell = dataCells[i];
                                        String columnKey = columnKeys[i];
                                        Object cellValue = cell != null ? cell.getValue() : null;
                                        row.put(columnKey, cellValue);
                                        // Also add by label for easier access
                                        if (i < wrapper.columns.size()) {
                                            row.put(wrapper.columns[i].label, cellValue);
                                        }
                                    }
                                }
                                wrapper.rows.add(row);
                            }
                        }
                        // If we successfully processed one, break
                        break;
                    } catch (TypeException e) {
                        // Continue to next key
                        continue;
                    }
                }
            }

            wrapper.hasData = !wrapper.rows.isEmpty();

        } catch (Exception e) {
            System.debug('Error fetching report data: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            wrapper.errorMessage = 'Error loading report: ' + e.getMessage();
        }

        return wrapper;
    }
}