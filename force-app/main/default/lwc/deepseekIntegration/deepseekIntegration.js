import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import callDeepSeekAPI from '@salesforce/apex/DeepSeekController.callDeepSeekAPI';
import callOpenRouterAPI from '@salesforce/apex/DeepSeekController.getCompletion';

export default class DeepseekIntegration extends LightningElement {
    @track inputData = '';
    @track responseData = '';

    // Handle input change
    handleInputChange(event) {
        this.inputData = event.target.value;
    }

    // Call DeepSeek API via Apex
    async getCompletion() {
        try {
            const result = await callOpenRouterAPI({ inputData: this.inputData });
            this.responseData = JSON.stringify(JSON.parse(result), null, 2);
            this.showToast('Success', 'API call successful!', 'success');
        } catch (error) {
            console.error('Error calling openrouter API:', error);
            this.showToast('Error', error.body.message, 'error');
        }
    }

    // Show Toast message
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title,
            message,
            variant
        });
        this.dispatchEvent(event);
    }
}