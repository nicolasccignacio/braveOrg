@isTest
global class PDFToExpenseItemProcessorTest {
    
    @isTest
    static void testPDFProcessing() {
        // Sample PDF content with transactions (Generic format)
        String samplePDFContent = 
            '12/15/2023 GROCERY STORE PURCHASE $123.45\n' +
            '12/16/2023 GAS STATION FUEL -$45.67\n' +
            '12/17/2023 VERDULERIA FRUTAS $25.30\n' +
            '12/18/2023 CARNICERIA CARNE $78.90\n' +
            '12/19/2023 PANADERIA FACTURAS $12.50\n' +
            '12/20/2023 PELUQUERIA CORTE $35.00\n' +
            '12/21/2023 TRANSPORTE UBER $18.75';
        
        Test.startTest();
        
        // Process the PDF content
        PDFToExpenseItemProcessor.ProcessingResult result = 
            PDFToExpenseItemProcessor.processPDFContent(samplePDFContent, 'generic');
        
        Test.stopTest();
        
        // Verify results
        System.assertEquals(7, result.totalTransactions, 'Should process 7 transactions');
        System.assertEquals(7, result.expenseItemPricesCreated, 'Should create 7 expense item price records');
        System.assertEquals(0, result.errors.size(), 'Should have no errors');
        
        // Verify that Item records were created
        List<Item__c> items = [SELECT Id, Name, Category__c FROM Item__c];
        System.assertEquals(7, items.size(), 'Should create 7 item records');
        
        // Verify that Expense_Item_Price records were created
        List<Expense_Item_Price__c> expenseItemPrices = [
            SELECT Id, Item__c, Price__c, Quantity__c, Expense_Date__c 
            FROM Expense_Item_Price__c
        ];
        System.assertEquals(7, expenseItemPrices.size(), 'Should create 7 expense item price records');
        
        // Verify specific categories were assigned correctly
        Map<String, String> expectedCategories = new Map<String, String>{
            'VERDULERIA FRUTAS' => 'Verduleria',
            'CARNICERIA CARNE' => 'Carniceria',
            'PANADERIA FACTURAS' => 'Panaderia',
            'PELUQUERIA CORTE' => 'Peluqueria',
            'TRANSPORTE UBER' => 'Transporte'
        };
        
        for (Item__c item : items) {
            if (expectedCategories.containsKey(item.Name)) {
                System.assertEquals(
                    expectedCategories.get(item.Name), 
                    item.Category__c, 
                    'Category should match for ' + item.Name
                );
            }
        }
    }
    
    @isTest
    static void testGaliciaPDFProcessing() {
        // Sample PDF content with Galicia format transactions
        String samplePDFContent = 
            '15/12/2023 GROCERY STORE PURCHASE 123,45\n' +
            '16/12/2023 GAS STATION FUEL -45,67\n' +
            '17/12/2023 VERDULERIA FRUTAS 25,30\n' +
            '18/12/2023 CARNICERIA CARNE 78,90\n' +
            '19/12/2023 PANADERIA FACTURAS 12,50\n' +
            '20/12/2023 PELUQUERIA CORTE 35,00\n' +
            '21/12/2023 TRANSPORTE UBER 18,75';
        
        Test.startTest();
        
        // Process the PDF content with Galicia format
        PDFToExpenseItemProcessor.ProcessingResult result = 
            PDFToExpenseItemProcessor.processPDFContent(samplePDFContent, 'galicia');
        
        Test.stopTest();
        
        // Verify results
        System.assertEquals(7, result.totalTransactions, 'Should process 7 Galicia transactions');
        System.assertEquals(7, result.expenseItemPricesCreated, 'Should create 7 expense item price records');
        System.assertEquals(0, result.errors.size(), 'Should have no errors');
        
        // Verify that Item records were created
        List<Item__c> items = [SELECT Id, Name, Category__c FROM Item__c];
        System.assertEquals(7, items.size(), 'Should create 7 item records');
        
        // Verify that Expense_Item_Price records were created
        List<Expense_Item_Price__c> expenseItemPrices = [
            SELECT Id, Item__c, Price__c, Quantity__c, Expense_Date__c 
            FROM Expense_Item_Price__c
        ];
        System.assertEquals(7, expenseItemPrices.size(), 'Should create 7 expense item price records');
        
        // Verify specific categories were assigned correctly for Galicia format
        Map<String, String> expectedCategories = new Map<String, String>{
            'VERDULERIA FRUTAS' => 'Verduleria',
            'CARNICERIA CARNE' => 'Carniceria',
            'PANADERIA FACTURAS' => 'Panaderia',
            'PELUQUERIA CORTE' => 'Peluqueria',
            'TRANSPORTE UBER' => 'Transporte'
        };
        
        for (Item__c item : items) {
            if (expectedCategories.containsKey(item.Name)) {
                System.assertEquals(
                    expectedCategories.get(item.Name), 
                    item.Category__c, 
                    'Category should match for ' + item.Name
                );
            }
        }
    }
    
    @isTest
    static void testEmptyPDFContent() {
        String emptyContent = '';
        
        Test.startTest();
        
        PDFToExpenseItemProcessor.ProcessingResult result = 
            PDFToExpenseItemProcessor.processPDFContent(emptyContent, 'generic');
        
        Test.stopTest();
        
        System.assertEquals(0, result.totalTransactions, 'Should process 0 transactions');
        System.assertEquals(0, result.expenseItemPricesCreated, 'Should create 0 expense item price records');
    }
    
    @isTest
    static void testInvalidPDFContent() {
        String invalidContent = 'This is not a valid bank statement format';
        
        Test.startTest();
        
        PDFToExpenseItemProcessor.ProcessingResult result = 
            PDFToExpenseItemProcessor.processPDFContent(invalidContent, 'generic');
        
        Test.stopTest();
        
        System.assertEquals(0, result.totalTransactions, 'Should process 0 transactions from invalid content');
        System.assertEquals(0, result.expenseItemPricesCreated, 'Should create 0 expense item price records');
    }

    @isTest
    static void testDuplicateProcessing() {
        // Sample PDF content with transactions
        String samplePDFContent = 
            '15/12/2023 GROCERY STORE PURCHASE 123,45\n' +
            '16/12/2023 GAS STATION FUEL 45,67\n' +
            '17/12/2023 VERDULERIA FRUTAS 25,30';
        
        Test.startTest();
        
        // Process the PDF content first time
        PDFToExpenseItemProcessor.ProcessingResult result1 = 
            PDFToExpenseItemProcessor.processPDFContent(samplePDFContent, 'galicia');
        
        // Process the same PDF content again (should not create duplicates)
        PDFToExpenseItemProcessor.ProcessingResult result2 = 
            PDFToExpenseItemProcessor.processPDFContent(samplePDFContent, 'galicia');
        
        Test.stopTest();
        
        // Verify first processing created records
        System.assertEquals(3, result1.totalTransactions, 'Should process 3 transactions');
        System.assertEquals(3, result1.expenseItemPricesCreated, 'Should create 3 expense item price records');
        
        // Verify second processing did NOT create duplicate records
        System.assertEquals(3, result2.totalTransactions, 'Should process 3 transactions again');
        System.assertEquals(0, result2.expenseItemPricesCreated, 'Should NOT create duplicate expense item price records');
        
        // Verify total records in database (should only be 3, not 6)
        List<Item__c> items = [SELECT Id, Name FROM Item__c];
        List<Expense_Item_Price__c> expenseItemPrices = [SELECT Id FROM Expense_Item_Price__c];
        
        System.assertEquals(3, items.size(), 'Should have exactly 3 item records (no duplicates)');
        System.assertEquals(3, expenseItemPrices.size(), 'Should have exactly 3 expense item price records (no duplicates)');
    }
}