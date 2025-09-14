# Agent Mode Usage Guide - Complete Autonomous Migration

## 🎯 Overview

The Gradle Migrator tool now supports **true agent mode** - autonomous repository migration with a single command. No manual cloning, no workspace setup required!

## ✅ What's Now Possible

### Before (Manual Workflow):
```
1. Clone repository manually
2. Open in VS Code
3. @gradle-migrator analyzeProject
4. @gradle-migrator updateFiles
5. @gradle-migrator commitChanges
6. Push manually
```

### After (Agent Mode):
```
@gradle-migrator migrateRepo {
  "gitUrl": "https://github.com/user/repo.git",
  "branchName": "gradle-migration",
  "commitMessage": "Migrate to new Gradle configuration"
}
```

**That's it!** ✨ The tool handles everything autonomously.

## 🚀 Usage Examples

### Basic Public Repository Migration
```
@gradle-migrator migrateRepo {
  "gitUrl": "https://github.com/user/public-repo.git",
  "branchName": "gradle-migration",
  "commitMessage": "Migrate Gradle configuration to latest standards"
}
```

### Private Repository with Authentication
```
@gradle-migrator migrateRepo {
  "gitUrl": "https://github.com/company/private-repo.git",
  "branchName": "feature/gradle-migration",
  "commitMessage": "Update Gradle build configuration",
  "auth": {
    "username": "your-username",
    "token": "ghp_your_personal_access_token"
  }
}
```

### Enterprise Repository Migration
```
@gradle-migrator migrateRepo {
  "gitUrl": "https://git.company.com/team/enterprise-app.git",
  "branchName": "chore/gradle-modernization",
  "commitMessage": "Modernize Gradle build system for improved performance",
  "auth": {
    "username": "service-account",
    "token": "enterprise_token_here"
  }
}
```

## 📋 Parameters Reference

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `gitUrl` | string | ✅ Yes | Full HTTPS URL to the Git repository |
| `branchName` | string | ✅ Yes | Name for the new migration branch |
| `commitMessage` | string | ✅ Yes | Commit message for the migration changes |
| `auth` | object | ❌ No | Authentication for private repositories |
| `auth.username` | string | ❌ No | Git username or service account |
| `auth.token` | string | ❌ No | Personal access token or password |

## 🔄 Complete Workflow

When you run `migrateRepo`, the tool performs these steps autonomously:

1. **🔄 Clone Repository**
   - Shallow clone for performance
   - Handles authentication if provided
   - Creates temporary workspace

2. **🌿 Create Migration Branch**
   - Creates new branch from default branch
   - Switches to migration branch
   - Validates branch creation

3. **🔍 Analyze Project Structure**
   - Discovers all Gradle files
   - Validates project structure
   - Identifies migration opportunities

4. **✅ Validate Existing Configuration**
   - Checks current Gradle setup
   - Identifies potential issues
   - Reports validation warnings

5. **🔧 Update Gradle Properties**
   - Modernizes gradle.properties
   - Creates backup of original files
   - Applies best practices

6. **📝 Replace Templates**
   - Updates settings.gradle
   - Replaces Jenkinsfile if present
   - Applies standardized templates

7. **💾 Commit Changes**
   - Stages all modified files
   - Creates commit with provided message
   - Includes detailed change summary

8. **🚀 Push to Remote**
   - Pushes new branch to origin
   - Sets upstream tracking
   - Prepares for pull request

## 📊 Success Response Example

```
✅ **Gradle Migration Completed Successfully**

**Repository**: https://github.com/user/repo.git
**Branch**: gradle-migration
**Duration**: 15432ms
**Files Processed**: 8

**Operations Status**:
- clone: success
- branch: success
- analysis: Found 8 Gradle files
- validation: success
- update: success
- templates: success
- commit: success
- push: success

**Next Steps**:
- Create pull request for branch 'gradle-migration'
- Review changes and merge when ready
```

## ⚠️ Error Handling

The tool provides comprehensive error handling:

### Authentication Errors
```
❌ **Migration Failed**

**Repository**: https://github.com/user/private-repo.git
**Error**: Git authentication failed. Please check your credentials or use a personal access token.

**Troubleshooting**:
- Verify repository URL is accessible
- Check authentication credentials if using private repo
- Ensure repository contains Gradle files
- Try running migration on a smaller test repository first
```

### Repository Not Found
```
❌ **Migration Failed**

**Repository**: https://github.com/user/nonexistent.git
**Error**: Repository not found: https://github.com/user/nonexistent.git. Please verify the URL is correct and you have access.
```

### No Gradle Files
```
❌ **Migration Failed**

**Repository**: https://github.com/user/non-gradle-repo.git
**Error**: No Gradle files found in the repository
```

## 🔐 Authentication Setup

### GitHub Personal Access Token
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Use in the `auth` parameter:
   ```json
   {
     "username": "your-github-username",
     "token": "ghp_your_generated_token"
   }
   ```

### Enterprise Git Authentication
- Use service account credentials
- Ensure token has repository read/write permissions
- Test authentication separately if needed

## 🎯 Best Practices

### Branch Naming
- Use descriptive prefixes: `feature/`, `chore/`, `update/`
- Include purpose: `gradle-migration`, `build-modernization`
- Follow team conventions

### Commit Messages
- Be descriptive and specific
- Include scope of changes
- Follow conventional commit format if used by team

### Repository Selection
- Test on smaller repositories first
- Ensure you have push permissions
- Backup important repositories before migration

## 🔧 Troubleshooting

### Common Issues

**Issue**: "Branch already exists"
**Solution**: Use a different branch name or delete existing branch

**Issue**: "Permission denied"
**Solution**: Verify authentication credentials and repository permissions

**Issue**: "Network timeout"
**Solution**: Check internet connection and repository accessibility

**Issue**: "No changes to commit"
**Solution**: Repository might already be migrated or have no Gradle files

### Debug Mode
For detailed logging, check the VS Code Output panel:
1. View → Output
2. Select "Gradle Migrator" from dropdown
3. Review detailed operation logs

## 🚀 Next Steps After Migration

1. **Create Pull Request**
   - Navigate to repository on GitHub/GitLab
   - Create PR from migration branch
   - Add detailed description of changes

2. **Review Changes**
   - Check all modified files
   - Verify build still works
   - Test in CI/CD pipeline

3. **Merge and Deploy**
   - Get team approval
   - Merge to main branch
   - Deploy and monitor

## 💡 Pro Tips

- **Batch Processing**: Migrate multiple repositories by running the command multiple times
- **Template Customization**: Modify templates in the extension for organization-specific standards
- **Integration**: Combine with CI/CD pipelines for automated migration workflows
- **Monitoring**: Use the detailed response to track migration success rates

---

**🎉 Congratulations!** You now have a fully autonomous Gradle migration agent that can handle entire repositories with a single command!