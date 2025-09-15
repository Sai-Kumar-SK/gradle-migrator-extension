# Quick Start Guide - Gradle Migrator Extension

🚀 **Get up and running with Gradle migration in 5 minutes!**

## 📋 Prerequisites

- VS Code 1.74 or higher
- A Gradle project (any version)
- Git repository (for best results)
- GitHub Copilot (for AI-powered features)

## ⚡ 5-Minute Setup

### Step 1: Install the Extension (1 minute)

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions)
3. Search for "Gradle Migrator"
4. Click **Install**

### Step 2: Open Your Project (30 seconds)

1. Open your Gradle project folder in VS Code
2. Ensure you have these files:
   - `build.gradle` or `build.gradle.kts`
   - `settings.gradle` or `settings.gradle.kts`
   - `gradle/wrapper/gradle-wrapper.properties`

### Step 3: Run Your First Migration (3 minutes)

#### Option A: Full Autonomous Migration (Recommended)

1. Open GitHub Copilot Chat (`Ctrl+Shift+I`)
2. Type this command:

```
@gradle-migrator migrateRepo {
  "gitUrl": "https://github.com/your-username/your-repo.git",
  "branchName": "gradle-migration",
  "commitMessage": "Migrate to modern Gradle practices"
}
```

3. Wait for the analysis and migration to complete
4. Review the changes and commit

#### Option B: Interactive Migration

1. Press `Ctrl+Shift+P` (Command Palette)
2. Type "Gradle Migrator: Run Interactive Migration"
3. Follow the step-by-step prompts
4. Review and approve each suggested change

### Step 4: Verify Results (30 seconds)

1. Run `./gradlew build` to ensure everything works
2. Check the migration summary for applied changes
3. Review the generated documentation

## 🎯 Common First-Time Scenarios

### Scenario 1: "I have an old Spring Boot project"

**Problem**: Using Gradle 4.x with deprecated syntax

**Solution**: Use this prompt in Copilot Chat:
```
@gradle-migrator Migrate this Spring Boot project to modern Gradle:
- Update from Gradle 4.x to 8.x
- Modernize Spring Boot dependencies
- Replace deprecated plugin syntax
- Implement version catalogs
- Optimize build performance
```

**Expected Results**:
- Gradle wrapper updated to 8.5
- `apply plugin:` → `plugins {}` block
- `compile` → `implementation`
- Spring Boot 3.x dependencies
- Version catalog implementation

### Scenario 2: "I need to fix security vulnerabilities"

**Problem**: Outdated dependencies with known CVEs

**Solution**: Use this prompt:
```
@gradle-migrator Perform security audit and migration:
- Scan for vulnerable dependencies
- Update to latest secure versions
- Fix insecure repository configurations
- Remove any hardcoded credentials
- Generate security report
```

**Expected Results**:
- Updated dependencies to latest secure versions
- HTTP repositories changed to HTTPS
- Security vulnerability report
- Recommendations for further improvements

### Scenario 3: "My builds are too slow"

**Problem**: Long build times, no caching

**Solution**: Use this prompt:
```
@gradle-migrator Optimize build performance:
- Enable parallel execution
- Implement build cache
- Configure Gradle daemon settings
- Resolve dependency conflicts
- Add configuration cache
```

**Expected Results**:
- `gradle.properties` with performance settings
- Parallel execution enabled
- Build cache configuration
- Optimized JVM settings
- Faster subsequent builds

## 🔧 Essential Configuration

### Recommended Settings

Add these to your VS Code settings (`Ctrl+,`):

```json
{
  "gradleMigrator.targetGradleVersion": "8.5",
  "gradleMigrator.enableInteractiveMode": true,
  "gradleMigrator.backupEnabled": true,
  "gradleMigrator.enableSecurityChecks": true,
  "gradleMigrator.enablePerformanceOptimizations": true
}
```

### Project-Specific Configuration

Create `.gradle-migrator.json` in your project root:

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

## 🎨 Effective Prompt Templates

### Template 1: Complete Migration
```
@gradle-migrator Comprehensive Gradle migration:

Project Details:
- Current Gradle version: [X.X]
- Target Gradle version: 8.5
- Project type: [Java/Kotlin/Android]
- Framework: [Spring Boot/Micronaut/Plain]

Migration Goals:
1. Modernize build scripts and plugin syntax
2. Update all dependencies to latest stable versions
3. Implement Gradle version catalogs
4. Optimize build performance
5. Ensure security best practices
6. Add comprehensive documentation

Priority: [Performance/Security/Modernization]
```

### Template 2: Targeted Update
```
@gradle-migrator Targeted Gradle update:

Focus Areas:
- [Dependencies/Plugins/Performance/Security]

Specific Requirements:
- Update [specific dependency] to version [X.X]
- Replace [deprecated plugin] with modern alternative
- Fix [specific issue]

Constraints:
- Maintain compatibility with [specific requirement]
- Preserve [custom configuration]
```

### Template 3: Legacy Modernization
```
@gradle-migrator Legacy project modernization:

Current State:
- Gradle version: [very old version]
- Last updated: [timeframe]
- Known issues: [list issues]

Modernization Plan:
1. Incremental Gradle version upgrade
2. Dependency security audit and updates
3. Build script syntax modernization
4. Performance optimization implementation
5. Documentation and best practices

Risk Level: [Low/Medium/High]
```

## 🚨 Troubleshooting Quick Fixes

### Issue: Extension not detecting Gradle files
**Solution**: 
- Ensure you've opened the correct folder
- Check file names: `build.gradle`, `settings.gradle`
- Verify file permissions

### Issue: Migration fails with errors
**Solution**:
- Check the Output panel for detailed logs
- Ensure your project builds before migration
- Try incremental migration instead of full migration

### Issue: AI suggestions seem incorrect
**Solution**:
- Provide more context in your prompts
- Specify your project type and constraints
- Use interactive mode to review each change

### Issue: Build breaks after migration
**Solution**:
- Use the extension's backup/restore feature
- Check the migration log for specific changes
- Apply changes incrementally and test

## 📈 Success Metrics

After migration, you should see:

✅ **Build Performance**:
- Faster build times (20-50% improvement typical)
- Parallel execution enabled
- Build cache working

✅ **Code Quality**:
- No deprecated syntax warnings
- Modern plugin usage
- Clean dependency declarations

✅ **Security**:
- No vulnerable dependencies
- HTTPS repositories only
- No hardcoded credentials

✅ **Maintainability**:
- Version catalogs implemented
- Consistent formatting
- Comprehensive documentation

## 🎓 Next Steps

Once you've completed your first migration:

1. **Read the [User Guide](USER_GUIDE.md)** for advanced features
2. **Explore [Migration Examples](EXAMPLES.md)** for real-world scenarios
3. **Set up automated migration** in your CI/CD pipeline
4. **Share your experience** with the community

## 💬 Getting Help

- **Quick Questions**: Use GitHub Copilot Chat with `@gradle-migrator`
- **Issues**: [GitHub Issues](https://github.com/your-org/gradle-migrator-extension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/gradle-migrator-extension/discussions)
- **Documentation**: [Complete User Guide](USER_GUIDE.md)

---

**🎉 Congratulations! You're now ready to modernize your Gradle builds efficiently!**

*Remember: Start small, test frequently, and leverage the AI assistance for best results.*