public class PDFBankStatementProcessor {
    
    // Structure to hold parsed transaction data
    public class TransactionData {
        public Date transactionDate;
        public String description;
        public Decimal amount;
        public String transactionType; // 'DEBIT' or 'CREDIT'
        public String reference;
        public Decimal balance;
    }
    
    // Structure to hold processing results
    public class ProcessingResult {
        public Boolean success;
        public String message;
        public List<Expense__c> createdExpenses;
        public List<String> errors;
        public Integer totalTransactions;
        public Integer processedTransactions;
    }
    
    /**
     * Main method to process PDF content and create expense records
     */
    public static ProcessingResult processBankStatement(String pdfContent, String bankType) {
        ProcessingResult result = new ProcessingResult();
        result.success = false;
        result.errors = new List<String>();
        result.createdExpenses = new List<Expense__c>();
        
        System.debug('=== PDFBankStatementProcessor: Starting processing ===');
        System.debug('Bank Type: ' + bankType);
        System.debug('PDF Content Length: ' + (pdfContent != null ? pdfContent.length() : 0));
        
        try {
            // Extract text from PDF content
            String extractedText = extractTextFromPDF(pdfContent);
            System.debug('Extracted Text Length: ' + (extractedText != null ? extractedText.length() : 0));
            System.debug('Extracted Text Preview: ' + (extractedText != null ? extractedText.substring(0, Math.min(500, extractedText.length())) : 'null'));
            
            if (String.isBlank(extractedText)) {
                result.errors.add('No text could be extracted from the PDF');
                System.debug('ERROR: No text could be extracted from the PDF');
                return result;
            }
            
            // Parse transactions based on bank type
            List<TransactionData> transactions = parseTransactions(extractedText, bankType);
            System.debug('Parsed Transactions Count: ' + transactions.size());
            
            if (transactions.isEmpty()) {
                result.errors.add('No transactions found in the PDF');
                System.debug('ERROR: No transactions found in the PDF');
                return result;
            }
            
            // Create expense records
            result.createdExpenses = createExpenseRecords(transactions);
            result.totalTransactions = transactions.size();
            result.processedTransactions = result.createdExpenses.size();
            result.success = true;
            result.message = 'Successfully processed ' + result.processedTransactions + ' transactions';
            
            System.debug('=== Processing Complete ===');
            System.debug('Total Transactions: ' + result.totalTransactions);
            System.debug('Processed Transactions: ' + result.processedTransactions);
            System.debug('Success: ' + result.success);
            System.debug('Message: ' + result.message);
            
        } catch (Exception e) {
            result.errors.add('Error processing PDF: ' + e.getMessage());
            System.debug('ERROR: Exception during processing: ' + e.getMessage());
            System.debug('Stack Trace: ' + e.getStackTraceString());
        }
        
        return result;
    }
    
    /**
     * Extract text from PDF content using Salesforce's built-in PDF parsing
     */
    private static String extractTextFromPDF(String pdfContent) {
        // This is a simplified version - in a real implementation,
        // you would use a third-party service or Salesforce's Document AI
        // For now, we'll assume the content is already extracted text
        
        // Remove common PDF artifacts and normalize text
        String cleanedText = pdfContent
            .replaceAll('\\s+', ' ')  // Replace multiple spaces with single space
            .replaceAll('\\n+', '\n') // Replace multiple newlines with single newline
            .trim();
            
        return cleanedText;
    }
    
    /**
     * Parse transactions from extracted text based on bank format
     */
    private static List<TransactionData> parseTransactions(String text, String bankType) {
        List<TransactionData> transactions = new List<TransactionData>();
        
        System.debug('=== parseTransactions: Starting ===');
        System.debug('Bank Type: ' + bankType);
        
        // Split text into lines
        List<String> lines = text.split('\n');
        System.debug('Total Lines: ' + lines.size());
        
        // Different parsing logic based on bank type
        if (bankType.toUpperCase() == 'GENERIC') {
            transactions = parseGenericFormat(lines);
        } else if (bankType.toUpperCase() == 'CHASE') {
            transactions = parseChaseFormat(lines);
        } else if (bankType.toUpperCase() == 'BANK_OF_AMERICA') {
            transactions = parseBankOfAmericaFormat(lines);
        } else if (bankType.toUpperCase() == 'WELLS_FARGO') {
            transactions = parseWellsFargoFormat(lines);
        } else {
            transactions = parseGenericFormat(lines);
        }
        
        System.debug('parseTransactions: Found ' + transactions.size() + ' transactions');
        return transactions;
    }
    
    /**
     * Generic parser for common bank statement formats
     */
    private static List<TransactionData> parseGenericFormat(List<String> lines) {
        List<TransactionData> transactions = new List<TransactionData>();
        
        System.debug('=== parseGenericFormat: Starting ===');
        System.debug('Lines to process: ' + lines.size());
        
        // Common patterns for transaction lines
        // Date pattern: MM/DD/YYYY or DD/MM/YYYY
        String datePattern = '(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})';
        // Amount pattern: $1,234.56 or -$1,234.56
        String amountPattern = '([$]?[-]?[\\d,]+[.]\\d{2})';
        
        System.debug('Date Pattern: ' + datePattern);
        System.debug('Amount Pattern: ' + amountPattern);
        
        Integer lineNumber = 0;
        for (String line : lines) {
            lineNumber++;
            line = line.trim();
            if (String.isBlank(line)) continue;
            
            System.debug('Processing Line ' + lineNumber + ': ' + line);
            
            // Look for lines that contain both date and amount
            if (Pattern.matches('.*' + datePattern + '.*' + amountPattern + '.*', line)) {
                System.debug('Line ' + lineNumber + ' matches pattern - processing transaction');
                TransactionData trans = new TransactionData();
                
                // Extract date
                Pattern datePat = Pattern.compile(datePattern);
                Matcher dateMatcher = datePat.matcher(line);
                if (dateMatcher.find()) {
                    String dateStr = dateMatcher.group(1);
                    trans.transactionDate = parseDate(dateStr);
                }
                
                // Extract amount
                Pattern amountPat = Pattern.compile(amountPattern);
                Matcher amountMatcher = amountPat.matcher(line);
                if (amountMatcher.find()) {
                    String amountStr = amountMatcher.group(1);
                    trans.amount = parseAmount(amountStr);
                    trans.transactionType = amountStr.startsWith('-') ? 'DEBIT' : 'CREDIT';
                }
                
                // Extract description (everything between date and amount)
                String description = extractDescription(line, datePattern, amountPattern);
                trans.description = description.trim();
                
                if (trans.transactionDate != null && trans.amount != null) {
                    transactions.add(trans);
                    System.debug('Added transaction: Date=' + trans.transactionDate + ', Amount=' + trans.amount + ', Description=' + trans.description);
                } else {
                    System.debug('Skipped transaction due to missing data: Date=' + trans.transactionDate + ', Amount=' + trans.amount);
                }
            }
        }
        
        return transactions;
    }
    
    /**
     * Chase Bank specific parser
     */
    private static List<TransactionData> parseChaseFormat(List<String> lines) {
        List<TransactionData> transactions = new List<TransactionData>();
        
        System.debug('=== parseChaseFormat: Starting ===');
        System.debug('Lines to process: ' + lines.size());
        
        for (String line : lines) {
            line = line.trim();
            if (String.isBlank(line)) continue;
            
            // Chase format: Date Description Amount
            // Example: "12/15/2023 PURCHASE AUTHORIZED ON 12/14 PAYPAL *STORE 123.45"
            
            // Look for date at the beginning
            if (Pattern.matches('^\\d{1,2}/\\d{1,2}/\\d{4}.*', line)) {
                TransactionData trans = new TransactionData();
                
                // Extract date (first 10 characters)
                String dateStr = line.substring(0, 10);
                trans.transactionDate = parseDate(dateStr);
                
                // Extract amount (last part of the line)
                String[] parts = line.split(' ');
                if (parts.size() > 1) {
                    String lastPart = parts[parts.size() - 1];
                    if (Pattern.matches('^[$]?[-]?[\\d,]+[.]\\d{2}$', lastPart)) {
                        trans.amount = parseAmount(lastPart);
                        trans.transactionType = lastPart.startsWith('-') ? 'DEBIT' : 'CREDIT';
                        
                        // Extract description (everything between date and amount)
                        String description = line.substring(11, line.lastIndexOf(' '));
                        trans.description = description.trim();
                        
                        transactions.add(trans);
                        System.debug('Added Chase transaction: Date=' + trans.transactionDate + ', Amount=' + trans.amount + ', Description=' + trans.description);
                    }
                }
            }
        }
        
        System.debug('parseChaseFormat: Found ' + transactions.size() + ' valid transactions');
        return transactions;
    }
    
    /**
     * Bank of America specific parser
     */
    private static List<TransactionData> parseBankOfAmericaFormat(List<String> lines) {
        // Similar to Chase but with different formatting
        return parseChaseFormat(lines); // Simplified for now
    }
    
    /**
     * Wells Fargo specific parser
     */
    private static List<TransactionData> parseWellsFargoFormat(List<String> lines) {
        // Similar to Chase but with different formatting
        return parseChaseFormat(lines); // Simplified for now
    }
    
    /**
     * Helper method to parse date strings
     */
    private static Date parseDate(String dateStr) {
        System.debug('parseDate: Parsing date string: ' + dateStr);
        try {
            // Handle different date formats
            if (Pattern.matches('\\d{1,2}/\\d{1,2}/\\d{4}', dateStr)) {
                // MM/DD/YYYY or DD/MM/YYYY
                List<String> parts = dateStr.split('/');
                Integer month = Integer.valueOf(parts[0]);
                Integer day = Integer.valueOf(parts[1]);
                Integer year = Integer.valueOf(parts[2]);
                
                // Assume MM/DD/YYYY format (US standard)
                Date result = Date.newInstance(year, month, day);
                System.debug('parseDate: Successfully parsed date: ' + result);
                return result;
            } else if (Pattern.matches('\\d{1,2}-\\d{1,2}-\\d{4}', dateStr)) {
                // MM-DD-YYYY or DD-MM-YYYY
                List<String> parts = dateStr.split('-');
                Integer month = Integer.valueOf(parts[0]);
                Integer day = Integer.valueOf(parts[1]);
                Integer year = Integer.valueOf(parts[2]);
                
                Date result = Date.newInstance(year, month, day);
                System.debug('parseDate: Successfully parsed date: ' + result);
                return result;
            }
        } catch (Exception e) {
            System.debug('parseDate: Error parsing date: ' + dateStr + ' - ' + e.getMessage());
        }
        System.debug('parseDate: Failed to parse date: ' + dateStr);
        return null;
    }
    
    /**
     * Helper method to parse amount strings
     */
    private static Decimal parseAmount(String amountStr) {
        System.debug('parseAmount: Parsing amount string: ' + amountStr);
        try {
            // Remove currency symbols and commas
            String cleanAmount = amountStr.replaceAll('[$,\\s]', '');
            Decimal result = Decimal.valueOf(cleanAmount);
            System.debug('parseAmount: Successfully parsed amount: ' + result);
            return result;
        } catch (Exception e) {
            System.debug('parseAmount: Error parsing amount: ' + amountStr + ' - ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Helper method to extract description from transaction line
     */
    private static String extractDescription(String line, String datePattern, String amountPattern) {
        // Find positions of date and amount
        Pattern datePat = Pattern.compile(datePattern);
        Pattern amountPat = Pattern.compile(amountPattern);
        
        Matcher dateMatcher = datePat.matcher(line);
        Matcher amountMatcher = amountPat.matcher(line);
        
        if (dateMatcher.find() && amountMatcher.find()) {
            Integer dateEnd = dateMatcher.end();
            Integer amountStart = amountMatcher.start();
            
            if (dateEnd < amountStart) {
                return line.substring(dateEnd, amountStart);
            }
        }
        
        return '';
    }
    
    /**
     * Create Expense__c records from parsed transactions
     */
    private static List<Expense__c> createExpenseRecords(List<TransactionData> transactions) {
        List<Expense__c> expenses = new List<Expense__c>();
        
        System.debug('=== createExpenseRecords: Starting ===');
        System.debug('Transactions to process: ' + transactions.size());
        
        for (TransactionData trans : transactions) {
            if (trans.transactionDate != null && trans.amount != null) {
                Expense__c expense = new Expense__c();
                expense.Expense_Date__c = trans.transactionDate;
                expense.Description__c = trans.description;
                expense.Amount__c = trans.amount;
                expense.Transaction_Type__c = trans.transactionType;
                
                expenses.add(expense);
                System.debug('Created expense record: Date=' + expense.Expense_Date__c + ', Amount=' + expense.Amount__c + ', Description=' + expense.Description__c);
            }
        }
        
        System.debug('Total expenses to insert: ' + expenses.size());
        
        if (!expenses.isEmpty()) {
            try {
                insert expenses;
                System.debug('Successfully inserted ' + expenses.size() + ' expense records');
            } catch (Exception e) {
                // Handle insertion errors
                System.debug('ERROR: Failed to insert expense records: ' + e.getMessage());
                System.debug('Stack Trace: ' + e.getStackTraceString());
                throw new PDFProcessingException('Error creating expense records: ' + e.getMessage());
            }
        }
        
        return expenses;
    }
    
    /**
     * Custom exception class
     */
    public class PDFProcessingException extends Exception {}
}