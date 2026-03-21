@isTest
global class PDFToExpenseItemControllerTest {
    
    @isTest
    static void testProcessPDF() {
        // Test the AuraEnabled method
        String samplePDFContent = 
            '15/12/2023 GROCERY STORE PURCHASE 123,45\n' +
            '16/12/2023 GAS STATION FUEL -45,67\n' +
            '17/12/2023 VERDULERIA FRUTAS 25,30';
        
        Test.startTest();
        
        PDFToExpenseItemController.ProcessingResponse response = 
            PDFToExpenseItemController.processPDF(samplePDFContent, 'galicia');
        
        Test.stopTest();
        
        // Verify response
        System.assertNotEquals(null, response, 'Response should not be null');
        System.assertEquals(true, response.success, 'Should be successful');
        System.assertEquals(3, response.totalTransactions, 'Should process 3 transactions');
        System.assertEquals(3, response.expenseItemPricesCreated, 'Should create 3 expense item prices');
        System.assertEquals(0, response.errors.size(), 'Should have no errors');
    }
    
    @isTest
    static void testProcessPDFEmptyContent() {
        Test.startTest();
        
        PDFToExpenseItemController.ProcessingResponse response = 
            PDFToExpenseItemController.processPDF('', 'galicia');
        
        Test.stopTest();
        
        // Verify response
        System.assertNotEquals(null, response, 'Response should not be null');
        System.assertEquals(false, response.success, 'Should fail with empty content');
        System.assertNotEquals(null, response.error, 'Should have error message');
    }
}