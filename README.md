# Gradle Migrator Extension

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=gradle-migrator)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-orange.svg)](package.json)

A powerful VS Code extension designed to automate the migration and version upgrading of Gradle projects. It provides comprehensive Git integration, file processing capabilities, and GitHub Copilot agent-mode integration for intelligent code suggestions and autonomous repository migration.

## 🚀 Features

### 🤖 Agent Mode (Autonomous Migration)
- **Single Command Migration**: Migrate entire repositories with one command
- **Repository Cloning**: Automatically clone, process, and push changes
- **Authentication Support**: Works with private repositories using tokens
- **Comprehensive Workflow**: Clone → Analyze → Migrate → Commit → Push

### 🔧 Manual Migration Tools
- **File Analysis**: Discover and analyze Gradle files in your project
- **Intelligent Updates**: Modernize gradle.properties and build configurations
- **Template Replacement**: Apply standardized settings.gradle and Jenkinsfile templates
- **Validation**: Comprehensive validation of Gradle configurations

### 🔗 Git Integration
- **Branch Management**: Create migration branches automatically
- **Commit Automation**: Smart commit messages with detailed change summaries
- **Push Operations**: Automatic pushing with upstream tracking
- **Status Monitoring**: Real-time Git repository status

### 🧠 AI-Powered Features
- **Copilot Integration**: Leverage GitHub Copilot for intelligent suggestions
- **Context-Aware Processing**: AI-driven decision making during migration
- **Error Recovery**: Intelligent error handling and recovery suggestions

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Gradle Migrator"
4. Click Install

### From VSIX Package
1. Download the latest `gradle-migrator-x.x.x.vsix` from releases
2. Open VS Code
3. Run command: `code --install-extension gradle-migrator-x.x.x.vsix`

### Development Installation
```bash
# Clone the repository
git clone https://github.com/your-username/gradle-migrator-extension.git
cd gradle-migrator-extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package extension
npm run package

# Install locally
code --install-extension gradle-migrator-0.2.0.vsix
```

## 🎯 Usage

### Agent Mode (Recommended)

Use the autonomous migration feature through GitHub Copilot Chat:

```
@gradle-migrator migrateRepo {
  "gitUrl": "https://github.com/user/repo.git",
  "branchName": "gradle-migration",
  "commitMessage": "Migrate Gradle configuration to latest standards"
}
```

#### With Authentication (Private Repos)
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

### Manual Mode

For existing workspaces, use individual commands:

```
# Analyze project structure
@gradle-migrator analyzeProject

# List Gradle files
@gradle-migrator listFiles

# Update gradle.properties
@gradle-migrator updateFiles

# Commit changes
@gradle-migrator commitChanges

# Get repository status
@gradle-migrator getRepoStatus
```

### Command Palette

Access features through VS Code Command Palette (Ctrl+Shift+P):
- `Gradle Migrator: Run Interactive Migration`
- `Gradle Migrator: Register LM Tool`
- `Gradle Migrator: Analyze Project`

### 🎯 Effective Usage Scenarios

#### Complete Project Migration
**When to use**: Migrating entire project to modern Gradle practices

**Recommended approach**:
1. Start with `@gradle-migrator analyzeProject` to understand current state
2. Use `@gradle-migrator migrateRepo` for comprehensive migration
3. Review changes before committing

**Example prompt for AI analysis**:
```
Analyze this Gradle project for migration to Gradle 8.x:
- Update deprecated plugins and syntax
- Modernize dependency declarations
- Implement version catalogs
- Optimize build performance
- Ensure security best practices
```

#### Security-Focused Migration
**When to use**: Addressing security vulnerabilities in dependencies

**Recommended approach**:
1. Focus on dependency updates and repository security
2. Use targeted migration with security emphasis

**Example prompt**:
```
Perform security-focused Gradle migration:
- Identify vulnerable dependencies with CVE details
- Update to latest secure versions
- Fix insecure repository URLs (HTTP vs HTTPS)
- Remove hardcoded credentials
```

#### Performance Optimization
**When to use**: Improving build performance

**Example prompt**:
```
Optimize Gradle build performance:
- Enable parallel execution and build cache
- Implement configuration cache
- Optimize JVM settings for Gradle daemon
- Resolve dependency conflicts
- Suggest modern plugin alternatives
```

#### Legacy Project Modernization
**When to use**: Upgrading from very old Gradle versions

**Example prompt**:
```
Modernize legacy Gradle project from version 4.x to 8.x:
- Update wrapper configuration
- Migrate deprecated APIs and plugins
- Handle breaking changes in dependency resolution
- Update build script syntax for compatibility
- Ensure all plugins support target version
```

### 💡 Best Practices for Effective Usage

#### Before Migration
- ✅ **Backup your project**: Always commit changes to version control
- ✅ **Test current build**: Run `./gradlew build` to ensure project builds successfully
- ✅ **Review dependencies**: Note any custom or internal dependencies
- ✅ **Check test coverage**: Ensure adequate tests to verify functionality

#### During Migration
- ✅ **Review AI suggestions**: Don't blindly accept all recommendations
- ✅ **Apply incrementally**: Make changes in small batches and test
- ✅ **Understand changes**: Read explanations for each modification
- ✅ **Use interactive mode**: Leverage the extension's approval workflow

#### After Migration
- ✅ **Verify build**: Run `./gradlew clean build` to ensure everything works
- ✅ **Execute tests**: Run your test suite to verify functionality
- ✅ **Performance check**: Compare build times before and after
- ✅ **Update documentation**: Reflect changes in project docs

#### Effective AI Prompts

**General Migration Template**:
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

**Dependency-Focused Template**:
```
Focus on dependency management for this Gradle project:
- Update all dependencies to latest stable versions
- Identify and resolve version conflicts
- Suggest implementation of Gradle Version Catalogs
- Check for deprecated or unmaintained libraries
- Recommend modern alternatives for legacy dependencies
- Ensure proper dependency scopes (implementation vs api)
```

**Plugin Migration Template**:
```
Analyze and modernize Gradle plugins in this project:
- Update all plugins to latest versions
- Migrate from legacy plugin application syntax
- Replace deprecated plugins with modern alternatives
- Ensure plugin compatibility with target Gradle version
- Optimize plugin configuration and performance
```

## 📚 Documentation

- **[User Guide](docs/USER_GUIDE.md)** - Comprehensive usage instructions and examples
- **[Agent Mode Usage Guide](docs/AGENT_MODE_USAGE_GUIDE.md)** - Complete guide for autonomous migration
- **[Tool Registration Analysis](docs/TOOL_REGISTRATION_ANALYSIS.md)** - Technical details about tool registration
- **[Extension Development Host Guide](docs/EXTENSION_DEVELOPMENT_HOST_GUIDE.md)** - Development and testing guide
- **[Performance Guide](docs/PERFORMANCE_GUIDE.md)** - Optimization and performance tips
- **[Design Document](docs/DESIGN.md)** - Architecture and design decisions

## 🛠️ Development

### Prerequisites
- Node.js 16+ and npm
- VS Code 1.74+
- TypeScript 4.9+
- Git

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/your-username/gradle-migrator-extension.git
cd gradle-migrator-extension

# Install dependencies
npm install

# Start development
npm run watch
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:unit
npm run test:integration
```

### Building and Packaging

```bash
# Compile TypeScript
npm run compile

# Package extension
npm run package

# Create VSIX package
vsce package
```

### Debugging

1. Open project in VS Code
2. Press F5 to launch Extension Development Host
3. Set breakpoints in TypeScript files
4. Test extension functionality

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Start for Contributors

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/your-username/gradle-migrator-extension.git`
3. **Create** a feature branch: `git checkout -b feature/amazing-feature`
4. **Make** your changes
5. **Test** thoroughly: `npm test`
6. **Commit** with conventional commits: `git commit -m "feat: add amazing feature"`
7. **Push** to your fork: `git push origin feature/amazing-feature`
8. **Create** a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests for new features
- Update documentation for user-facing changes
- Use conventional commit messages
- Ensure all tests pass before submitting PR

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for code formatting
- Write JSDoc comments for public APIs

## 📋 Roadmap

### Version 0.3.0
- [ ] Enhanced AI integration with custom prompts
- [ ] Support for Maven project migration
- [ ] Batch repository processing
- [ ] Custom migration templates

### Version 0.4.0
- [ ] Web interface for repository management
- [ ] Integration with CI/CD pipelines
- [ ] Advanced analytics and reporting
- [ ] Multi-language support

## 🐛 Known Issues

- Extension Development Host isolation limits tool visibility
- Large repositories may require increased timeout settings
- Some enterprise Git configurations may need additional setup

See [Issues](https://github.com/your-username/gradle-migrator-extension/issues) for complete list.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- GitHub Copilot team for AI integration APIs
- VS Code extension development community
- Gradle community for best practices
- Contributors and beta testers

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/gradle-migrator-extension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/gradle-migrator-extension/discussions)
- **Documentation**: [Wiki](https://github.com/your-username/gradle-migrator-extension/wiki)

---

**Made with ❤️ for the developer community**

*Automate your Gradle migrations and focus on what matters most - building great software!*