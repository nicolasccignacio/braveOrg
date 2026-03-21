/**
 * Validated Salesforce object API names from env.
 */

function itemObjectApiName() {
  const raw = (process.env.SF_ITEM_OBJECT || "Item__c").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) {
    throw new Error("Invalid SF_ITEM_OBJECT");
  }
  return raw;
}

function expenseObjectApiName() {
  const raw = (process.env.SF_EXPENSE_OBJECT || "Expense_Item_Price__c").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) {
    throw new Error("Invalid SF_EXPENSE_OBJECT");
  }
  return raw;
}

module.exports = { itemObjectApiName, expenseObjectApiName };
