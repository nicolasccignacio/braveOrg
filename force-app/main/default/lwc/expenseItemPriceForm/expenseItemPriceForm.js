import { LightningElement, api } from 'lwc';
import createExpenseItemPrice from '@salesforce/apex/ExpenseItemPriceController.createExpenseItemPrice';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class ExpenseItemPriceForm extends LightningElement {
  @api monthlyReportUrl = 'https://lookerstudio.google.com/embed/reporting/dcff8ae2-d4de-4d25-9eff-c5ecbeabd4c4/page/ZnojF';
  @api annualReportUrl = 'https://lookerstudio.google.com/embed/reporting/a91a59d0-2bed-47b1-9be3-3becab3e46fc/page/ZnojF';

  loading = false;
  errorMessage = '';
  successMessage = '';
  activeTab = 'form';

  /** When true, report iframes are mounted (first visit to Reports tab). */
  reportsEmbedsEnabled = false;
  /** When true, annual iframe src is set (user opted in). */
  annualReportRequested = false;

  handleSubmit(event) {
    // Prevent default form submission to Salesforce
    event.preventDefault();
    this.loading = true;

    // Get the fields from the form
    const fields = event.detail.fields;
    console.log('fields', JSON.stringify(fields, null, 2));
    
    // Build payload for Apex controller
    const payload = {
      itemId: fields.Item__c || null,
      itemText: null, // Not used when using lightning-input-field
      price: fields.Price__c || null,
      quantity: fields.Quantity__c || null,
      expenseDate: fields.Expense_Date__c || null,
      cuotas: fields.Cuotas__c || null,
      referencia: fields.Referencia__c || null
    };



    // Call Apex method instead of default form submission
    createExpenseItemPrice({ input: JSON.stringify(payload) })
      .then(result => {
        this.loading = false;

        this.dispatchEvent(
          new ShowToastEvent({
            title: 'Success',
            message: result?.id
              ? `Expense Item Price created (Id: ${result.id}).`
              : 'Expense Item Price created successfully',
            variant: 'success'
          })
        );

        this.handleReset();
      })
      .catch(error => {
        this.loading = false;
        let msg = 'An error occurred while creating the record.';
        
        if (error && error.body && error.body.message) {
          msg = error.body.message;
        } else if (error && error.message) {
          msg = error.message;
        } else if (error && Array.isArray(error.body) && error.body.length > 0) {
          msg = error.body[0].message;
        }
        
        this.errorMessage = msg;

        // Show toast notification
        this.dispatchEvent(
          new ShowToastEvent({
            title: 'Error',
            message: msg,
            variant: 'error'
          })
        );
      });
  }

  handleReset() {
    const form = this.template.querySelector('lightning-record-edit-form');
    if (form) {
      form.reset();
    }
    this.errorMessage = '';
    this.successMessage = '';
  }

  handleTabChange(event) {
    const selectedTab = event.detail.value || event.target.value;
    this.activeTab = selectedTab;
    if (selectedTab === 'reports') {
      this.reportsEmbedsEnabled = true;
    }
  }

  handleLoadAnnualReport() {
    this.annualReportRequested = true;
  }
}