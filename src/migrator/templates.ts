export const SETTINGS_GRADLE_TEMPLATE = `// generated settings.gradle\nrootProject.name = 'migrated-project'\n`;

export const JENKINSFILE_TEMPLATE = `pipeline { agent any; stages { stage('Build') { steps { echo 'Building...' } } } }\n`;
