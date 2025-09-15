# Gradle Migrator Extension - User Guide

## Overview

The Gradle Migrator Extension is an AI-powered VS Code extension that helps you migrate and modernize Gradle build scripts. It provides intelligent analysis, automated suggestions, and comprehensive migration capabilities for your Java/Kotlin projects.

## Features

- 🤖 **AI-Powered Analysis**: Leverages advanced AI to understand your build scripts and provide contextual suggestions
- 🔍 **Comprehensive Scanning**: Analyzes build.gradle, settings.gradle, gradle.properties, and wrapper files
- 🛡️ **Security Analysis**: Identifies vulnerabilities in dependencies and insecure configurations
- ⚡ **Performance Optimization**: Suggests build performance improvements and modern Gradle features
- 🔄 **Interactive Migration**: Step-by-step guided migration with user approval
- 📊 **Detailed Reporting**: Comprehensive analysis reports with prioritized recommendations

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Gradle Migrator"
4. Click Install

## Getting Started

### 1. Open Your Gradle Project

Open a folder containing Gradle build files in VS Code. The extension will automatically detect:
- `build.gradle` / `build.gradle.kts`
- `settings.gradle` / `settings.gradle.kts`
- `gradle.properties`
- `gradle/wrapper/gradle-wrapper.properties`

### 2. Access the Extension

You can use the extension in several ways:

#### Command Palette
- Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Type "Gradle Migrator" to see available commands:
  - `Gradle Migrator: Migrate Repository`
  - `Gradle Migrator: Analyze Project`
  - `Gradle Migrator: Security Scan`
  - `Gradle Migrator: Performance Analysis`

#### Context Menu
- Right-click on any Gradle file
- Select "Migrate with AI" from the context menu

#### Activity Bar
- Look for the Gradle Migrator icon in the Activity Bar
- Click to open the extension panel

## Usage Scenarios

### Scenario 1: Complete Project Migration

**When to use**: You want to migrate an entire project to modern Gradle practices.

**Steps**:
1. Open your project in VS Code
2. Run `Gradle Migrator: Migrate Repository`
3. Review the analysis report
4. Accept or reject suggested changes interactively
5. Review the final migration summary

**Example Prompt for AI Analysis**:
```
Analyze this Gradle project for migration to Gradle 8.x. Focus on:
- Updating deprecated plugins and syntax
- Modernizing dependency declarations
- Implementing version catalogs
- Optimizing build performance
- Ensuring security best practices
```

### Scenario 2: Security-Focused Analysis

**When to use**: You want to identify and fix security vulnerabilities.

**Steps**:
1. Run `Gradle Migrator: Security Scan`
2. Review identified vulnerabilities
3. Apply suggested dependency updates
4. Fix insecure repository configurations

**Example Prompt**:
```
Perform a comprehensive security analysis of this Gradle project:
- Identify vulnerable dependencies with CVE details
- Check for insecure repository URLs (HTTP vs HTTPS)
- Analyze hardcoded credentials or sensitive data
- Suggest secure alternatives and latest versions
```

### Scenario 3: Performance Optimization

**When to use**: Your builds are slow and you want to optimize performance.

**Steps**:
1. Run `Gradle Migrator: Performance Analysis`
2. Review build performance recommendations
3. Implement suggested optimizations
4. Enable parallel builds and caching

**Example Prompt**:
```
Optimize this Gradle build for performance:
- Enable parallel execution and build cache
- Implement configuration cache
- Optimize JVM settings for Gradle daemon
- Identify and resolve dependency conflicts
- Suggest modern plugin alternatives
```

### Scenario 4: Gradle Version Upgrade

**When to use**: You need to upgrade from an older Gradle version.

**Steps**:
1. Specify target Gradle version in settings
2. Run migration analysis
3. Review breaking changes and required updates
4. Apply changes incrementally

**Example Prompt**:
```
Upgrade this project from Gradle 6.x to Gradle 8.5:
- Update wrapper configuration
- Migrate deprecated APIs and plugins
- Handle breaking changes in dependency resolution
- Update build script syntax for compatibility
- Ensure all plugins support the target version
```

## Effective Prompts for AI Analysis

### General Migration Prompt
```
Analyze this Gradle build script and provide comprehensive migration recommendations:

1. **Modernization**: Update to latest Gradle practices and syntax
2. **Dependencies**: Suggest latest stable versions and identify conflicts
3. **Performance**: Recommend build optimization strategies
4. **Security**: Identify vulnerabilities and insecure configurations
5. **Best Practices**: Ensure adherence to current Gradle conventions

Target Gradle version: 8.5
Project type: [Java/Kotlin/Android/Multi-module]
Priority: [Performance/Security/Modernization]
```

### Dependency-Focused Prompt
```
Focus on dependency management for this Gradle project:

- Update all dependencies to latest stable versions
- Identify and resolve version conflicts
- Suggest implementation of Gradle Version Catalogs
- Check for deprecated or unmaintained libraries
- Recommend modern alternatives for legacy dependencies
- Ensure proper dependency scopes (implementation vs api)
```

### Plugin Migration Prompt
```
Analyze and modernize Gradle plugins in this project:

- Update all plugins to latest versions
- Migrate from legacy plugin application syntax
- Replace deprecated plugins with modern alternatives
- Ensure plugin compatibility with target Gradle version
- Optimize plugin configuration and performance
```

## Configuration Options

### Extension Settings

Access settings via `File > Preferences > Settings` and search for "Gradle Migrator":

- **Target Gradle Version**: Set the desired Gradle version for migration
- **Enable Interactive Mode**: Choose between automatic and manual approval
- **Backup Enabled**: Automatically create backups before modifications
- **Performance Optimizations**: Enable build performance suggestions
- **Security Checks**: Enable vulnerability scanning
- **Parallel Processing**: Use multiple threads for large projects

### Project-Specific Configuration

Create a `.gradle-migrator.json` file in your project root:

```json
{
  "targetGradleVersion": "8.5",
  "enablePerformanceOptimizations": true,
  "enableSecurityChecks": true,
  "excludePatterns": [
    "**/build/**",
    "**/.gradle/**"
  ],
  "customMappings": {
    "repositories": {
      "http://old-repo.com": "https://new-repo.com"
    }
  }
}
```

## Best Practices

### Before Migration

1. **Backup Your Project**: Always commit your changes to version control
2. **Review Current State**: Run `./gradlew build` to ensure project builds successfully
3. **Check Dependencies**: Note any custom or internal dependencies
4. **Test Coverage**: Ensure you have adequate tests to verify functionality

### During Migration

1. **Review Suggestions**: Don't blindly accept all AI suggestions
2. **Test Incrementally**: Apply changes in small batches and test
3. **Understand Changes**: Read the explanations for each suggested modification
4. **Backup Frequently**: Use the extension's backup feature

### After Migration

1. **Verify Build**: Run `./gradlew clean build` to ensure everything works
2. **Run Tests**: Execute your test suite to verify functionality
3. **Performance Check**: Compare build times before and after migration
4. **Documentation**: Update project documentation to reflect changes

## Troubleshooting

### Common Issues

#### Extension Not Detecting Gradle Files
- Ensure you've opened the correct folder containing Gradle files
- Check that files are named correctly (build.gradle, settings.gradle, etc.)
- Verify file permissions and accessibility

#### AI Analysis Fails
- Check your internet connection
- Verify AI service configuration in settings
- Try with a smaller, simpler build file first

#### Migration Breaks Build
- Restore from backup using the extension's restore feature
- Review the migration log for specific errors
- Apply changes incrementally rather than all at once

#### Performance Issues
- Disable parallel processing for very large projects
- Increase VS Code memory limits if needed
- Use exclude patterns to skip unnecessary directories

### Getting Help

1. **Check Logs**: View extension logs in VS Code Output panel
2. **GitHub Issues**: Report bugs or request features on our GitHub repository
3. **Documentation**: Refer to additional docs in the `/docs` folder
4. **Community**: Join discussions in our community forums

## Advanced Usage

### Custom Migration Rules

Create custom migration rules by extending the extension's configuration:

```json
{
  "customRules": [
    {
      "name": "Update Spring Boot",
      "pattern": "org.springframework.boot:spring-boot-starter.*",
      "replacement": "Use latest Spring Boot 3.x version",
      "severity": "high"
    }
  ]
}
```

### Batch Processing

For multiple projects, use the batch processing feature:

1. Create a workspace with multiple Gradle projects
2. Run `Gradle Migrator: Batch Migrate Workspace`
3. Review and apply changes across all projects

### Integration with CI/CD

Use the extension's CLI mode for automated migration in CI/CD pipelines:

```bash
# Generate migration report
code --install-extension gradle-migrator
code --command gradle-migrator.analyze --project-path ./my-project
```

## Examples

### Example 1: Legacy Spring Boot Project

**Before**:
```gradle
apply plugin: 'java'
apply plugin: 'org.springframework.boot'

dependencies {
    compile 'org.springframework.boot:spring-boot-starter-web:2.1.0'
    testCompile 'junit:junit:4.12'
}
```

**After Migration**:
```gradle
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.0'
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    testImplementation 'org.junit.jupiter:junit-jupiter'
}
```

### Example 2: Multi-module Project with Version Catalog

**Before**: Individual version declarations in each module

**After**: Centralized version catalog:

`gradle/libs.versions.toml`:
```toml
[versions]
spring-boot = "3.2.0"
junit = "5.10.0"

[libraries]
spring-boot-starter-web = { module = "org.springframework.boot:spring-boot-starter-web", version.ref = "spring-boot" }
junit-jupiter = { module = "org.junit.jupiter:junit-jupiter", version.ref = "junit" }

[plugins]
spring-boot = { id = "org.springframework.boot", version.ref = "spring-boot" }
```

`build.gradle`:
```gradle
plugins {
    alias(libs.plugins.spring.boot)
}

dependencies {
    implementation libs.spring.boot.starter.web
    testImplementation libs.junit.jupiter
}
```

## Conclusion

The Gradle Migrator Extension is a powerful tool for modernizing your Gradle builds. By following this guide and using effective prompts, you can:

- Reduce migration time from days to hours
- Ensure best practices and security compliance
- Improve build performance significantly
- Stay up-to-date with the latest Gradle features

For more information, visit our [GitHub repository](https://github.com/your-org/gradle-migrator-extension) or check the additional documentation in the `/docs` folder.

---

**Happy Migrating! 🚀**