@RestResource(urlMapping='/pdf-to-expense-item/process/*')
global class PDFToExpenseItemController {
    
    /**
     * Process PDF content and create records
     */
    @AuraEnabled(cacheable=false)
    global static ProcessingResponse processPDF(String pdfContent, String bankType) {
        System.debug('=== PDF Processing Started ===');
        System.debug('PDF Content length: ' + (pdfContent != null ? pdfContent.length() : 0));
        System.debug('Bank Type: ' + bankType);
        
        ProcessingResponse response = new ProcessingResponse();
        
        try {
            PDFToExpenseItemProcessor.ProcessingResult result = 
                PDFToExpenseItemProcessor.processPDFContent(pdfContent, bankType, false);
            
            response.success = result.errors.isEmpty();
            response.totalTransactions = result.totalTransactions;
            response.itemsCreated = result.itemsCreated;
            response.expenseItemPricesCreated = result.expenseItemPricesCreated;
            response.errors = result.errors;
            response.createdRecords = result.createdRecords;
            
            System.debug('Processing completed successfully');
            System.debug('Total transactions: ' + result.totalTransactions);
            System.debug('Items created: ' + result.itemsCreated);
            System.debug('Expense item prices created: ' + result.expenseItemPricesCreated);
            
        } catch (Exception e) {
            System.debug('Error in processPDF: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            
            response.success = false;
            response.errors = new List<String>{'Processing failed: ' + e.getMessage()};
        }
        
        return response;
    }
    
    /**
     * Preview PDF content without creating records
     */
    @AuraEnabled(cacheable=false)
    global static ProcessingResponse previewPDF(String pdfContent, String bankType) {
        System.debug('=== PDF Preview Started ===');
        System.debug('PDF Content length: ' + (pdfContent != null ? pdfContent.length() : 0));
        System.debug('Bank Type: ' + bankType);
        
        ProcessingResponse response = new ProcessingResponse();
        
        try {
            PDFToExpenseItemProcessor.ProcessingResult result = 
                PDFToExpenseItemProcessor.processPDFContent(pdfContent, bankType, true);
            
            response.success = result.errors.isEmpty();
            response.totalTransactions = result.totalTransactions;
            response.previewRecords = result.previewRecords;
            response.errors = result.errors;
            response.isPreviewMode = true;
            
            System.debug('Preview completed successfully');
            System.debug('Total transactions: ' + result.totalTransactions);
            System.debug('Preview records: ' + result.previewRecords.size());
            
        } catch (Exception e) {
            System.debug('Error in previewPDF: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            
            response.success = false;
            response.errors = new List<String>{'Preview failed: ' + e.getMessage()};
        }
        
        return response;
    }
    
    @HttpPost
    global static ProcessingResponse processPDFRest() {
        ProcessingResponse response = new ProcessingResponse();
        
        try {
            // Get request body
            String requestBody = RestContext.request.requestBody.toString();
            PDFRequest request = (PDFRequest) JSON.deserialize(requestBody, PDFRequest.class);
            
            if (String.isBlank(request.pdfContent)) {
                response.success = false;
                response.error = 'PDF content is required';
                return response;
            }
            
            // Process PDF content
            PDFToExpenseItemProcessor.ProcessingResult result = 
                PDFToExpenseItemProcessor.processPDFContent(request.pdfContent, request.bankType);
            
            // Build response
            response.success = result.errors.isEmpty();
            response.totalTransactions = result.totalTransactions;
            response.itemsCreated = result.expenseItemPricesCreated;
            response.expenseItemPricesCreated = result.expenseItemPricesCreated;
            response.errors = result.errors;
            
            if (!result.createdRecords.isEmpty()) {
                response.createdRecordIds = new List<String>();
                for (Expense_Item_Price__c record : result.createdRecords) {
                    response.createdRecordIds.add(record.Id);
                }
            }
            
        } catch (Exception e) {
            response.success = false;
            response.error = 'Processing error: ' + e.getMessage();
            System.debug('PDF Processing Error: ' + e.getMessage());
            System.debug('Stack Trace: ' + e.getStackTraceString());
        }
        
        return response;
    }
    
    // Request wrapper class
    global class PDFRequest {
        @AuraEnabled global String pdfContent { get; set; }
        @AuraEnabled global String bankType { get; set; }
        
        public PDFRequest() {
            this.bankType = 'generic';
        }
    }
    
    // Response wrapper class
    global class ProcessingResponse {
        @AuraEnabled global Boolean success { get; set; }
        @AuraEnabled global String error { get; set; }
        @AuraEnabled global Integer totalTransactions { get; set; }
        @AuraEnabled global Integer itemsCreated { get; set; }
        @AuraEnabled global Integer expenseItemPricesCreated { get; set; }
        @AuraEnabled global List<String> errors { get; set; }
        @AuraEnabled global List<String> createdRecordIds { get; set; }
        @AuraEnabled global List<Expense_Item_Price__c> createdRecords { get; set; }
        @AuraEnabled global List<PDFToExpenseItemProcessor.TransactionPreview> previewRecords { get; set; }
        @AuraEnabled global Boolean isPreviewMode { get; set; }
        
        public ProcessingResponse() {
            this.success = false;
            this.errors = new List<String>();
            this.createdRecordIds = new List<String>();
            this.isPreviewMode = false;
        }
    }
}