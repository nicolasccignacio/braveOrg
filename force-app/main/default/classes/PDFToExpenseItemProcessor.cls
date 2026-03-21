global class PDFToExpenseItemProcessor {
    
    global class ProcessingResult {
        @AuraEnabled public Integer totalTransactions { get; set; }
        @AuraEnabled public Integer itemsCreated { get; set; }
        @AuraEnabled public Integer expenseItemPricesCreated { get; set; }
        @AuraEnabled public List<String> errors { get; set; }
        @AuraEnabled public List<Expense_Item_Price__c> createdRecords { get; set; }
        @AuraEnabled public List<TransactionPreview> previewRecords { get; set; }
        @AuraEnabled public Boolean isPreviewMode { get; set; }
        
        public ProcessingResult() {
            this.totalTransactions = 0;
            this.itemsCreated = 0;
            this.expenseItemPricesCreated = 0;
            this.errors = new List<String>();
            this.createdRecords = new List<Expense_Item_Price__c>();
            this.previewRecords = new List<TransactionPreview>();
            this.isPreviewMode = false;
        }
    }
    
    global class TransactionPreview {
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public Decimal amount { get; set; }
        @AuraEnabled public Date transactionDate { get; set; }
        @AuraEnabled public String category { get; set; }
        @AuraEnabled public String itemName { get; set; }
        @AuraEnabled public Boolean isNewItem { get; set; }
        @AuraEnabled public String existingItemId { get; set; }
        @AuraEnabled public String validationStatus { get; set; }
        @AuraEnabled public String validationMessage { get; set; }
        
        public TransactionPreview() {
            this.validationStatus = 'Valid';
            this.validationMessage = '';
        }
    }
    
    public class TransactionData {
        public Date transactionDate;
        public String description;
        public Decimal amount;
        public String transactionType;
        public String category;
    }
    
    /**
     * Main processing method for PDF content
     */
    public static ProcessingResult processPDFContent(String pdfContent, String bankType) {
        return processPDFContent(pdfContent, bankType, false);
    }
    
    /**
     * Main processing method for PDF content with preview option
     */
    public static ProcessingResult processPDFContent(String pdfContent, String bankType, Boolean previewMode) {
        ProcessingResult result = new ProcessingResult();
        result.isPreviewMode = previewMode;
        
        try {
            // Extract transactions from PDF
            List<TransactionData> transactions = extractTransactionsFromPDF(pdfContent, bankType);
            result.totalTransactions = transactions.size();
            
            if (previewMode) {
                // Preview mode: validate and show data without creating records
                for (TransactionData trans : transactions) {
                    if (trans.transactionDate != null && trans.amount != null) {
                        TransactionPreview preview = createTransactionPreview(trans);
                        result.previewRecords.add(preview);
                    }
                }
            } else {
                // Normal mode: create records
                for (TransactionData trans : transactions) {
                    if (trans.transactionDate != null && trans.amount != null) {
                        try {
                            // Create or find Item record
                            Item__c item = createOrFindItem(trans.description, trans.category);
                            
                            // Check if this expense item price already exists
                            if (!expenseItemPriceExists(item.Id, trans.transactionDate, trans.amount)) {
                                // Create Expense_Item_Price record only if it doesn't exist
                                Expense_Item_Price__c expenseItemPrice = createExpenseItemPrice(trans, item);
                                result.expenseItemPricesCreated++;
                                result.createdRecords.add(expenseItemPrice);
                            } else {
                                System.debug('Expense item price already exists for: ' + trans.description + ' on ' + trans.transactionDate);
                            }
                            
                        } catch (Exception e) {
                            result.errors.add('Error processing transaction: ' + trans.description + ' - ' + e.getMessage());
                        }
                    }
                }
            }
            
        } catch (Exception e) {
            result.errors.add('PDF Processing Error: ' + e.getMessage());
        }
        
        return result;
    }
    
    /**
     * Extract transactions from PDF content
     */
    private static List<TransactionData> extractTransactionsFromPDF(String pdfContent, String bankType) {
        List<TransactionData> transactions = new List<TransactionData>();
        
        // Split content into lines
        List<String> lines = pdfContent.split('\n');
        
        for (String line : lines) {
            line = line.trim();
            if (String.isNotBlank(line)) {
                TransactionData trans = parseTransactionLine(line, bankType);
                if (trans != null) {
                    transactions.add(trans);
                }
            }
        }
        
        return transactions;
    }
    
    /**
     * Parse individual transaction line based on bank type
     */
    private static TransactionData parseTransactionLine(String line, String bankType) {
        TransactionData trans = new TransactionData();
        
        try {
            if (bankType.toLowerCase() == 'generic') {
                trans = parseGenericFormat(line);
            } else if (bankType.toLowerCase() == 'chase') {
                trans = parseChaseFormat(line);
            } else if (bankType.toLowerCase() == 'bankofamerica') {
                trans = parseBankOfAmericaFormat(line);
            } else if (bankType.toLowerCase() == 'wellsfargo') {
                trans = parseWellsFargoFormat(line);
            } else if (bankType.toLowerCase() == 'galicia') {
                trans = parseGaliciaFormat(line);
            } else {
                trans = parseGenericFormat(line);
            }
            
            // Auto-categorize based on description
            if (trans != null && String.isNotBlank(trans.description)) {
                trans.category = autoCategorizeTransaction(trans.description);
            }
            
        } catch (Exception e) {
            System.debug('Error parsing line: ' + line + ' - ' + e.getMessage());
            return null;
        }
        
        return trans;
    }
    
    /**
     * Parse generic bank statement format
     */
    private static TransactionData parseGenericFormat(String line) {
        TransactionData trans = new TransactionData();
        
        // Pattern: MM/DD/YYYY DESCRIPTION $AMOUNT or MM/DD/YYYY DESCRIPTION -$AMOUNT
        Pattern datePattern = Pattern.compile('(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})');
        Pattern amountPattern = Pattern.compile('([$]?[-]?\\d+[.,]\\d{2})');
        
        Matcher dateMatcher = datePattern.matcher(line);
        Matcher amountMatcher = amountPattern.matcher(line);
        
        if (dateMatcher.find() && amountMatcher.find()) {
            String dateStr = dateMatcher.group(1);
            String amountStr = amountMatcher.group(1);
            
            // Parse date
            trans.transactionDate = parseDate(dateStr);
            
            // Parse amount
            amountStr = amountStr.replace('$', '').replace(',', '');
            trans.amount = Math.abs(Decimal.valueOf(amountStr));
            trans.transactionType = amountStr.startsWith('-') ? 'DEBIT' : 'CREDIT';
            
            // Extract description (everything between date and amount)
            String description = line.substring(dateMatcher.end()).trim();
            description = description.substring(0, description.lastIndexOf(amountStr)).trim();
            trans.description = description;
        }
        
        return trans;
    }
    
    /**
     * Parse Chase bank format
     */
    private static TransactionData parseChaseFormat(String line) {
        // Chase specific parsing logic
        return parseGenericFormat(line);
    }
    
    /**
     * Parse Bank of America format
     */
    private static TransactionData parseBankOfAmericaFormat(String line) {
        // Bank of America specific parsing logic
        return parseGenericFormat(line);
    }
    
    /**
     * Parse Wells Fargo format
     */
    private static TransactionData parseWellsFargoFormat(String line) {
        // Wells Fargo specific parsing logic
        return parseGenericFormat(line);
    }
    
    /**
     * Parse Banco Galicia format
     * Galicia typically uses formats like:
     * DD/MM/YYYY DESCRIPTION AMOUNT
     * DD/MM/YYYY DESCRIPTION -AMOUNT (for debits)
     */
    private static TransactionData parseGaliciaFormat(String line) {
        TransactionData trans = new TransactionData();
        
        try {
            // Galicia format patterns
            // Pattern 1: DD/MM/YYYY DESCRIPTION AMOUNT
            // Pattern 2: DD/MM/YYYY DESCRIPTION -AMOUNT (debit)
            Pattern galiciaPattern = Pattern.compile('(\\d{1,2}/\\d{1,2}/\\d{4})\\s+(.+?)\\s+([-]?\\d+[.,]\\d{2})$');
            Matcher matcher = galiciaPattern.matcher(line.trim());
            
            if (matcher.find()) {
                String dateStr = matcher.group(1);
                String description = matcher.group(2).trim();
                String amountStr = matcher.group(3);
                
                // Parse date (DD/MM/YYYY format)
                trans.transactionDate = parseGaliciaDate(dateStr);
                
                // Parse amount
                amountStr = amountStr.replace(',', '.');
                trans.amount = Math.abs(Decimal.valueOf(amountStr));
                trans.transactionType = amountStr.startsWith('-') ? 'DEBIT' : 'CREDIT';
                
                // Set description
                trans.description = description;
            } else {
                // Fallback to generic parsing if Galicia pattern doesn't match
                return parseGenericFormat(line);
            }
            
        } catch (Exception e) {
            System.debug('Error parsing Galicia line: ' + line + ' - ' + e.getMessage());
            return null;
        }
        
        return trans;
    }
    
    /**
     * Parse Galicia date format (DD/MM/YYYY)
     */
    private static Date parseGaliciaDate(String dateStr) {
        try {
            List<String> parts = dateStr.split('/');
            if (parts.size() == 3) {
                Integer day = Integer.valueOf(parts[0]);
                Integer month = Integer.valueOf(parts[1]);
                Integer year = Integer.valueOf(parts[2]);
                return Date.newInstance(year, month, day);
            }
        } catch (Exception e) {
            System.debug('Error parsing Galicia date: ' + dateStr + ' - ' + e.getMessage());
        }
        return null;
    }
    
    /**
     * Parse date string to Date object
     */
    private static Date parseDate(String dateStr) {
        try {
            if (dateStr.contains('/')) {
                List<String> parts = dateStr.split('/');
                if (parts.size() == 3) {
                    Integer month = Integer.valueOf(parts[0]);
                    Integer day = Integer.valueOf(parts[1]);
                    Integer year = Integer.valueOf(parts[2]);
                    if (year < 100) year += 2000;
                    return Date.newInstance(year, month, day);
                }
            } else if (dateStr.contains('-')) {
                List<String> parts = dateStr.split('-');
                if (parts.size() == 3) {
                    Integer day = Integer.valueOf(parts[0]);
                    Integer month = Integer.valueOf(parts[1]);
                    Integer year = Integer.valueOf(parts[2]);
                    if (year < 100) year += 2000;
                    return Date.newInstance(year, month, day);
                }
            }
        } catch (Exception e) {
            System.debug('Error parsing date: ' + dateStr + ' - ' + e.getMessage());
        }
        return null;
    }
    
    /**
     * Auto-categorize transaction based on description
     */
    private static String autoCategorizeTransaction(String description) {
        String descriptionLower = description.toLowerCase();
        
        // Food categories
        if (descriptionLower.contains('verduleria') || descriptionLower.contains('fruta') || descriptionLower.contains('verdura')) {
            return 'Verduleria';
        }
        if (descriptionLower.contains('carniceria') || descriptionLower.contains('carne') || descriptionLower.contains('pollo')) {
            return 'Carniceria';
        }
        if (descriptionLower.contains('panaderia') || descriptionLower.contains('pan') || descriptionLower.contains('factura')) {
            return 'Panaderia';
        }
        if (descriptionLower.contains('heladeria') || descriptionLower.contains('helado')) {
            return 'Heladeria';
        }
        if (descriptionLower.contains('almacen') || descriptionLower.contains('super') || descriptionLower.contains('market')) {
            return 'Almacen';
        }
        if (descriptionLower.contains('hielo')) {
            return 'Hielo';
        }
        if (descriptionLower.contains('outdoor') || descriptionLower.contains('take away')) {
            return 'Outdoor Food';
        }
        
        // Services
        if (descriptionLower.contains('peluqueria') || descriptionLower.contains('corte')) {
            return 'Peluqueria';
        }
        if (descriptionLower.contains('transporte') || descriptionLower.contains('uber') || descriptionLower.contains('taxi')) {
            return 'Transporte';
        }
        if (descriptionLower.contains('servicio') || descriptionLower.contains('service')) {
            return 'Servicios de Uso';
        }
        
        // Other categories
        if (descriptionLower.contains('impuesto') || descriptionLower.contains('tax')) {
            return 'Impuestos';
        }
        if (descriptionLower.contains('entretenimiento') || descriptionLower.contains('cine') || descriptionLower.contains('movie')) {
            return 'Entretenimiento';
        }
        if (descriptionLower.contains('regalo') || descriptionLower.contains('gift')) {
            return 'Regalo';
        }
        if (descriptionLower.contains('seguro') || descriptionLower.contains('insurance')) {
            return 'Seguro';
        }
        if (descriptionLower.contains('casa') || descriptionLower.contains('home') || descriptionLower.contains('house')) {
            return 'Casa';
        }
        if (descriptionLower.contains('prestamo') || descriptionLower.contains('loan')) {
            return 'Prestamo';
        }
        if (descriptionLower.contains('vestimenta') || descriptionLower.contains('ropa') || descriptionLower.contains('clothing')) {
            return 'Vestimenta';
        }
        
        return 'Almacen'; // Default category
    }
    
    /**
     * Create or find Item record
     */
    private static Item__c createOrFindItem(String description, String category) {
        // Clean and normalize the description for comparison
        String normalizedDescription = description.trim();
        String searchDescription = normalizedDescription.length() > 80 ? normalizedDescription.substring(0, 80) : normalizedDescription;
        
        // First try exact match
        List<Item__c> existingItems = [
            SELECT Id, Name, Category__c 
            FROM Item__c 
            WHERE Name = :searchDescription
            LIMIT 1
        ];
        
        if (!existingItems.isEmpty()) {
            System.debug('Found existing item with exact match: ' + existingItems[0].Name);
            return existingItems[0];
        }
        
        // If no exact match, try to find similar items (but be more restrictive)
        // Only look for items that start with the same first 30 characters
        if (searchDescription.length() > 30) {
            String prefix = searchDescription.substring(0, 30);
            existingItems = [
                SELECT Id, Name, Category__c 
                FROM Item__c 
                WHERE Name LIKE :prefix + '%'
                AND Name != :searchDescription
                LIMIT 5
            ];
            
            // Check if any of these are actually the same transaction
            for (Item__c item : existingItems) {
                if (item.Name.equalsIgnoreCase(searchDescription) || 
                    item.Name.equalsIgnoreCase(normalizedDescription)) {
                    System.debug('Found existing item with case-insensitive match: ' + item.Name);
                    return item;
                }
            }
        }
        
        // Create new item only if no match found
        System.debug('Creating new item: ' + searchDescription);
        Item__c newItem = new Item__c();
        newItem.Name = searchDescription;
        newItem.Category__c = category;
        newItem.Type__c = 'Product'; // Default to Product
        
        try {
            insert newItem;
            return newItem;
        } catch (Exception e) {
            System.debug('Error creating item: ' + e.getMessage());
            throw new PDFProcessingException('Error creating item record: ' + e.getMessage());
        }
    }
    
    /**
     * Check if an Expense_Item_Price__c record already exists for the given item, date, and amount
     */
    private static Boolean expenseItemPriceExists(Id itemId, Date expenseDate, Decimal amount) {
        List<Expense_Item_Price__c> existingPrices = [
            SELECT Id 
            FROM Expense_Item_Price__c 
            WHERE Item__c = :itemId 
            AND Expense_Date__c = :expenseDate 
            AND Price__c = :amount 
            LIMIT 1
        ];
        return !existingPrices.isEmpty();
    }
    
    /**
     * Create Expense_Item_Price record
     */
    private static Expense_Item_Price__c createExpenseItemPrice(TransactionData trans, Item__c item) {
        Expense_Item_Price__c expenseItemPrice = new Expense_Item_Price__c();
        expenseItemPrice.Item__c = item.Id;
        expenseItemPrice.Price__c = trans.amount;
        expenseItemPrice.Quantity__c = 1; // Default quantity
        expenseItemPrice.Expense_Date__c = trans.transactionDate;
        expenseItemPrice.Cuotas__c = 1; // Default to 1 installment
        
        try {
            insert expenseItemPrice;
            return expenseItemPrice;
        } catch (Exception e) {
            System.debug('Error creating expense item price: ' + e.getMessage());
            throw new PDFProcessingException('Error creating expense item price record: ' + e.getMessage());
        }
    }
    
    /**
     * Create a TransactionPreview record for preview mode
     */
    private static TransactionPreview createTransactionPreview(TransactionData trans) {
        TransactionPreview preview = new TransactionPreview();
        preview.description = trans.description;
        preview.amount = trans.amount;
        preview.transactionDate = trans.transactionDate;
        preview.category = trans.category;
        
        // Validate the transaction data
        List<String> validationErrors = validateTransaction(trans);
        if (!validationErrors.isEmpty()) {
            preview.validationStatus = 'Error';
            preview.validationMessage = String.join(validationErrors, '; ');
        }
        
        // Determine if it's a new item or existing item
        String normalizedDescription = trans.description.trim();
        String searchDescription = normalizedDescription.length() > 80 ? normalizedDescription.substring(0, 80) : normalizedDescription;
        preview.itemName = searchDescription;
        
        List<Item__c> existingItems = [
            SELECT Id, Name, Category__c 
            FROM Item__c 
            WHERE Name = :searchDescription
            LIMIT 1
        ];
        
        if (!existingItems.isEmpty()) {
            preview.isNewItem = false;
            preview.existingItemId = existingItems[0].Id;
            if (preview.validationStatus == 'Valid') {
                preview.validationMessage = 'Item already exists: ' + existingItems[0].Name;
            }
        } else {
            preview.isNewItem = true;
            if (preview.validationStatus == 'Valid') {
                preview.validationStatus = 'Warning';
                preview.validationMessage = 'New item will be created: ' + searchDescription;
            }
        }
        
        return preview;
    }
    
    /**
     * Validate transaction data
     */
    private static List<String> validateTransaction(TransactionData trans) {
        List<String> errors = new List<String>();
        
        if (String.isBlank(trans.description)) {
            errors.add('Description is required');
        }
        
        if (trans.amount == null || trans.amount <= 0) {
            errors.add('Amount must be greater than 0');
        }
        
        if (trans.transactionDate == null) {
            errors.add('Transaction date is required');
        } else if (trans.transactionDate > Date.today()) {
            errors.add('Transaction date cannot be in the future');
        }
        
        if (String.isBlank(trans.category)) {
            errors.add('Category is required');
        }
        
        return errors;
    }
    
    /**
     * Custom exception class
     */
    public class PDFProcessingException extends Exception {}
}