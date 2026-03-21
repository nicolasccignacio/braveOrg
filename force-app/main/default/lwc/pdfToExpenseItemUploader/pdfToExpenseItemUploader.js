import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import processPDFContent from '@salesforce/apex/PDFToExpenseItemController.processPDF';

export default class PdfToExpenseItemUploader extends LightningElement {
    @api recordId;
    @track selectedBankType = 'galicia';
    @track isProcessing = false;
    @track hasUploadedFile = false;
    @track uploadedFileContent = '';
    @track results = {};
    @track showResults = false;
    @track showErrors = false;
    
    acceptedFormats = ['.pdf', '.txt'];
    
    bankTypeOptions = [
        { label: 'Banco Galicia', value: 'galicia' }
    ];
    
    handleBankTypeChange(event) {
        this.selectedBankType = event.detail.value;
    }
    
    handleTextContentChange(event) {
        this.uploadedFileContent = event.detail.value;
        this.hasUploadedFile = this.uploadedFileContent && this.uploadedFileContent.trim().length > 0;
    }
    
    clearContent() {
        this.uploadedFileContent = '';
        this.hasUploadedFile = false;
    }
    
    usePastedContent() {
        if (this.uploadedFileContent && this.uploadedFileContent.trim().length > 0) {
            this.processPDF();
        }
    }
    
    get isContentEmpty() {
        return !this.uploadedFileContent || this.uploadedFileContent.trim().length === 0;
    }
    
    handleUploadFinished(event) {
        const uploadedFiles = event.detail.files;
        if (uploadedFiles.length > 0) {
            this.hasUploadedFile = true;
            this.showToast('Success', 'PDF uploaded successfully', 'success');
            
            // Try to read the file content
            const file = uploadedFiles[0];
            console.log('File uploaded:', file.name, 'Size:', file.size);
            
            // For PDF files, we can't read the content directly in the browser
            // due to security restrictions. The user will need to copy/paste the text content
            if (file.type === 'application/pdf') {
                this.showToast('Info', 'Please copy the text content from your PDF and paste it in the text area below', 'info');
            } else {
                // For text files, we can read the content
                this.readFileContent(file);
            }
        }
    }
    
    readFileContent(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.uploadedFileContent = e.target.result;
            this.showToast('Success', 'File content loaded successfully', 'success');
            console.log('File content loaded, length:', this.uploadedFileContent.length);
        };
        reader.onerror = (e) => {
            console.error('Error reading file:', e);
            this.showToast('Error', 'Failed to read file content', 'error');
        };
        reader.readAsText(file);
    }
    
    async processPDF() {
        this.isProcessing = true;
        this.showResults = false;
        this.showErrors = false;
        
        try {
            console.log('Starting PDF processing...');
            console.log('Selected bank type:', this.selectedBankType);
            
            let pdfContent;
            
            if (this.uploadedFileContent && this.uploadedFileContent.trim().length > 0) {
                // Use the actual pasted content
                pdfContent = this.uploadedFileContent;
                console.log('Using pasted PDF content');
                console.log('Content length:', pdfContent.length);
            }
            
            console.log('PDF content (first 500 chars):', pdfContent.substring(0, 500));
            console.log('PDF content length:', pdfContent.length);
            console.log('Number of lines:', pdfContent.split('\n').length);
            
            console.log('Calling Apex method...');
            console.log('Parameters:', { pdfContent: pdfContent, bankType: this.selectedBankType });
            
            const result = await processPDFContent({
                pdfContent: pdfContent,
                bankType: this.selectedBankType
            });
            console.log('Apex result:', result);
            console.log('Result type:', typeof result);
            console.log('Result keys:', Object.keys(result || {}));
            
            this.results = result;
            
            if (this.results.success) {
                this.showResults = true;
                this.showToast('Success', `Processed ${result.totalTransactions} transactions`, 'success');
            } else {
                this.showErrors = true;
                console.error('Processing failed:', result.error);
                this.showToast('Error', 'Processing failed. Check errors below.', 'error');
            }
            
        } catch (error) {
            console.error('Error processing PDF:', error);
            console.error('Error details:', JSON.stringify(error));
            this.showErrors = true;
            this.results = {
                success: false,
                error: error.message || 'Unknown error',
                errors: [error.message || 'Unknown error']
            };
            this.showToast('Error', 'Failed to process PDF: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            this.isProcessing = false;
        }
    }
    
    getSamplePDFContent() {
        // Sample PDF content for testing (Galicia format)
        return `BANCO GALICIA
EXTRACTOS DE CUENTA

Cuenta: 1234567890
Período: 15/12/2023 - 21/12/2023

FECHA          DESCRIPCIÓN                    IMPORTE
15/12/2023     GROCERY STORE PURCHASE         123,45
16/12/2023     GAS STATION FUEL               -45,67
17/12/2023     VERDULERIA FRUTAS              25,30
18/12/2023     CARNICERIA CARNE               78,90
19/12/2023     PANADERIA FACTURAS             12,50
20/12/2023     PELUQUERIA CORTE               35,00
21/12/2023     TRANSPORTE UBER                18,75

Saldo Final: 247,23`;
    }
    
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
}