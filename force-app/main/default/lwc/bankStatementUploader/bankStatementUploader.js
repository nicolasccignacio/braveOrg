import { LightningElement, track, wire, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import processBankStatement from '@salesforce/apex/BankStatementProcessor.processBankStatement';
import getRecentBankStatements from '@salesforce/apex/BankStatementProcessor.getRecentBankStatements';
import getRecentExpenses from '@salesforce/apex/BankStatementProcessor.getRecentExpenses';
import { NavigationMixin } from 'lightning/navigation';

export default class BankStatementUploader extends NavigationMixin(LightningElement) {
    @api recordId;
    @track isProcessing = false;
    @track showResults = false;
    @track resultMessage = '';
    @track recentBankStatements = [];
    @track recentExpenses = [];
    @track selectedFile = null;
    @track fileName = '';
    @track selectedBankType = '';
    
    // Bank type options
    bankTypeOptions = [
        { label: 'Generic (works with most formats)', value: 'generic' },
        { label: 'Chase Bank', value: 'chase' },
        { label: 'Bank of America', value: 'boa' },
        { label: 'Wells Fargo', value: 'wells' },
        { label: 'Citibank', value: 'citi' }
    ];

    // Wire methods to get data
    @wire(getRecentBankStatements)
    wiredBankStatements({ error, data }) {
        if (data) {
            this.recentBankStatements = data;
        } else if (error) {
            console.error('Error loading bank statements:', error);
        }
    }

    @wire(getRecentExpenses)
    wiredExpenses({ error, data }) {
        if (data) {
            this.recentExpenses = data;
        } else if (error) {
            console.error('Error loading expenses:', error);
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.selectedFile = file;
            this.fileName = file.name;
            
            // Show success message
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'File Selected',
                    message: `File "${file.name}" has been selected for processing.`,
                    variant: 'success'
                })
            );
        }
    }

    handleBankTypeChange(event) {
        this.selectedBankType = event.detail.value;
    }

    handleProcessFile() {
        if (!this.selectedFile) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'No File Selected',
                    message: 'Please select a bank statement file first.',
                    variant: 'error'
                })
            );
            return;
        }

        this.isProcessing = true;
        this.showResults = false;

        // Read file as base64
        const reader = new FileReader();
        reader.onload = () => {
            const base64Data = reader.result.split(',')[1]; // Remove data URL prefix
            
            processBankStatement({
                fileName: this.fileName,
                base64Data: base64Data,
                contentType: this.selectedFile.type
            })
            .then(result => {
                this.resultMessage = result;
                this.showResults = true;
                this.isProcessing = false;
                
                // Refresh data
                this.refreshData();
                
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Processing Complete',
                        message: result,
                        variant: 'success'
                    })
                );
            })
            .catch(error => {
                this.isProcessing = false;
                console.error('Error processing file:', error);
                
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Processing Error',
                        message: error.body?.message || 'An error occurred while processing the file.',
                        variant: 'error'
                    })
                );
            });
        };

        reader.readAsDataURL(this.selectedFile);
    }

    handleReset() {
        this.selectedFile = null;
        this.fileName = '';
        this.selectedBankType = '';
        this.showResults = false;
        this.resultMessage = '';
        
        // Clear file input
        const fileInput = this.template.querySelector('lightning-input[type="file"]');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    refreshData() {
        // Refresh the wired data
        this.template.querySelector('lightning-card').dispatchEvent(new CustomEvent('refresh'));
    }

    handleViewExpenses() {
        // Navigate to expenses list view
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: {
                objectApiName: 'Expense__c',
                actionName: 'list'
            }
        });
    }

    handleViewBankStatements() {
        // Navigate to bank statements list view
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: {
                objectApiName: 'BankStatement__c',
                actionName: 'list'
            }
        });
    }

    get expenseTransactionTypeClass() {
        return this.recentExpenses && this.recentExpenses.length > 0 && 
               this.recentExpenses[0].Transaction_Type__c === 'DEBIT' ? 
               'slds-text-color_error' : 'slds-text-color_success';
    }

    getBadgeVariant(status) {
        return status === 'Completed' ? 'success' : 'warning';
    }
}