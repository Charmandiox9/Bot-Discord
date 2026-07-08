pipeline {
    agent any
    
    environment {
        GITHUB_CREDENTIAL_ID = 'github-token'
        IMAGE_NAME = 'discord-bot'
        DOCKER_BUILDKIT = '0'
    }

    stages {
        stage('Limpieza de Código') {
            steps {
                deleteDir()
            }
        }

        stage('Clonar Repositorio') {
            steps {
                checkout scm
            }
        }

        stage('Construir Imagen Podman') {
            steps {
                sh 'docker rm -f buildx_buildkit_default || true'
                sh 'docker build -t ${IMAGE_NAME}:latest .'
            }
        }

        stage('Desplegar') {
            steps {
                sh 'docker stop discord-bot || true'
                sh 'docker rm -f discord-bot || true'

                // Levantar nueva versión usando el contenedor de compose
                // Se mapea la ruta host para que docker-compose sepa de dónde sacar .env y playlists.json
                sh '''
                docker run --rm \
                -v /var/www/discord-bot/Bot-Discord:/var/www/discord-bot/Bot-Discord \
                -v /run/user/1000/podman/podman.sock:/var/run/docker.sock \
                -w /var/www/discord-bot/Bot-Discord \
                docker.io/docker/compose:1.29.2 \
                -f docker-compose.yml up -d
                '''

                sh 'docker image prune -f || true'
            }
        }
    }
}
