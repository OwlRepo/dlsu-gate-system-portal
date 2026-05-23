pipeline {
    agent any
    
    triggers {
        cron '${CRON_EXPRESSION}'
    }
    
    environment {
        API_URL = 'http://localhost:3000'
        API_TOKEN = credentials('dlsu-gate-system-api-token')
    }
    
    stages {
        stage('Trigger Sync') {
            steps {
                script {
                    def response = httpRequest(
                        url: "${API_URL}/database-sync/sync",
                        httpMode: 'POST',
                        customHeaders: [[name: 'Authorization', value: "Bearer ${API_TOKEN}"]]
                    )
                    
                    if (response.status != 200) {
                        error "Failed to trigger sync: ${response.content}"
                    }
                }
            }
        }
    }
} 