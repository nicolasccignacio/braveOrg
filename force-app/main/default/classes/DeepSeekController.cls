public with sharing class DeepSeekController {
    @AuraEnabled
    public static String callDeepSeekAPI(String inputData) {

        String apiKey = 'sk-8ee1df6bde6949499ddd9a1c5505a61b';
        String endpoint = 'https://api.deepseek.com/chat/completions'; // Replace with the actual endpoint

        // Prepare the request body
        Map<String, Object> requestBody = new Map<String, Object>();
        requestBody.put('model', 'deepseek-chat');
        requestBody.put('stream', false);

        // Prepare the messages array
        List<Map<String, String>> messages = new List<Map<String, String>>();
        messages.add(new Map<String, String>{
            'role' => 'system',
            'content' => inputData
        });
        requestBody.put('messages', messages);

        // Serialize the request body to JSON
        String requestBodyJson = JSON.serialize(requestBody);

        // Create the HTTP request
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + apiKey);
        req.setBody(requestBodyJson);

        // Send the request
        HttpResponse res = new Http().send(req);

        // Handle the response
        if (res.getStatusCode() == 200) {
            return res.getBody();
        } else {
            throw new AuraHandledException('Error calling DeepSeek API: ' + res.getStatusCode() + ' ' + res.getStatus());
        }
    }

    @AuraEnabled(cacheable=false)
    public static String getCompletion(String prompt) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('https://openrouter.ai/api/v1/chat/completions');
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer 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');
        req.setHeader('Content-Type', 'application/json');

        String body = JSON.serialize(new Map<String, Object>{
            'model' => 'deepseek/deepseek-r1-0528:free',
            'messages' => new List<Object>{
                new Map<String, Object>{
                    'role' => 'user',
                    'content' => prompt
                }
            }
        });
        req.setBody(body);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() == 200) {
            return res.getBody();
        } else {
            throw new AuraHandledException('Error calling DeepSeek API: ' + res.getStatusCode() + ' ' + res.getStatus());
        }
    }
}