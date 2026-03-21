@RestResource(urlMapping='/bank-statement/upload/*')
global class BankStatementUploadController {
    
    @AuraEnabled
    public static UploadResponse processBankStatement(String pdfContent, String bankType, String fileName) {
        UploadResponse response = new UploadResponse();
        
        System.debug('=== BankStatementUploadController.processBankStatement: Starting ===');
        System.debug('Bank Type: ' + bankType);
        System.debug('File Name: ' + fileName);
        System.debug('PDF Content Length: ' + (pdfContent != null ? pdfContent.length() : 0));
        
        try {
            if (String.isBlank(pdfContent)) {
                response.success = false;
                response.message = 'PDF content is required';
                System.debug('ERROR: PDF content is required');
                return response;
            }
            
            if (String.isBlank(bankType)) {
                response.success = false;
                response.message = 'Bank type is required';
                System.debug('ERROR: Bank type is required');
                return response;
            }
            
            // Process the bank statement
            System.debug('Calling PDFBankStatementProcessor.processBankStatement...');
            PDFBankStatementProcessor.ProcessingResult result = 
                PDFBankStatementProcessor.processBankStatement(pdfContent, bankType);
            
            // Build response
            response.success = result.success;
            response.message = result.message;
            response.totalTransactions = result.totalTransactions;
            response.processedTransactions = result.processedTransactions;
            response.errors = result.errors;
            
            System.debug('Processing Result:');
            System.debug('  Success: ' + result.success);
            System.debug('  Message: ' + result.message);
            System.debug('  Total Transactions: ' + result.totalTransactions);
            System.debug('  Processed Transactions: ' + result.processedTransactions);
            System.debug('  Errors: ' + result.errors);
            
            if (result.success && !result.createdExpenses.isEmpty()) {
                response.expenseIds = new List<String>();
                for (Expense__c expense : result.createdExpenses) {
                    response.expenseIds.add(expense.Id);
                }
            }
            
        } catch (Exception e) {
            response.success = false;
            response.message = 'Error processing request: ' + e.getMessage();
            response.errors = new List<String>{ e.getMessage() };
        }
        
        return response;
    }
    
    @HttpPost
    global static UploadResponse uploadBankStatement() {
        UploadResponse response = new UploadResponse();
        
        try {
            // Get the request body
            String requestBody = RestContext.request.requestBody.toString();
            
            // Parse the request
            UploadRequest request = (UploadRequest) JSON.deserialize(requestBody, UploadRequest.class);
            
            if (String.isBlank(request.pdfContent)) {
                response.success = false;
                response.message = 'PDF content is required';
                return response;
            }
            
            if (String.isBlank(request.bankType)) {
                response.success = false;
                response.message = 'Bank type is required';
                return response;
            }
            
            // Process the bank statement
            PDFBankStatementProcessor.ProcessingResult result = 
                PDFBankStatementProcessor.processBankStatement(request.pdfContent, request.bankType);
            
            // Build response
            response.success = result.success;
            response.message = result.message;
            response.totalTransactions = result.totalTransactions;
            response.processedTransactions = result.processedTransactions;
            response.errors = result.errors;
            
            if (result.success && !result.createdExpenses.isEmpty()) {
                response.expenseIds = new List<String>();
                for (Expense__c expense : result.createdExpenses) {
                    response.expenseIds.add(expense.Id);
                }
            }
            
        } catch (Exception e) {
            response.success = false;
            response.message = 'Error processing request: ' + e.getMessage();
            response.errors = new List<String>{ e.getMessage() };
        }
        
        return response;
    }
    
    // Request wrapper class
    global class UploadRequest {
        global String pdfContent;
        global String bankType;
        global String fileName;
    }
    
    // Response wrapper class
    global class UploadResponse {
        global Boolean success;
        global String message;
        global Integer totalTransactions;
        global Integer processedTransactions;
        global List<String> expenseIds;
        global List<String> errors;
        
        global UploadResponse() {
            this.expenseIds = new List<String>();
            this.errors = new List<String>();
        }
    }
}