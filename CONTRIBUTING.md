# Contributing to Gradle Migrator Extension

Thank you for your interest in contributing to the Gradle Migrator Extension! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Release Process](#release-process)

## 🤝 Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) to help us maintain a welcoming community.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 16 or higher
- **npm**: Version 8 or higher
- **VS Code**: Version 1.74 or higher
- **Git**: Latest stable version
- **TypeScript**: Version 4.9 or higher (installed via npm)

### Development Environment Setup

1. **Fork the Repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/gradle-migrator-extension.git
   cd gradle-migrator-extension
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Project**
   ```bash
   npm run compile
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Start Development**
   ```bash
   # Watch mode for automatic compilation
   npm run watch
   ```

6. **Test in VS Code**
   - Open the project in VS Code
   - Press `F5` to launch Extension Development Host
   - Test your changes in the new VS Code window

## 🛠️ Development Setup

### Project Structure

```
gradle-migrator-extension/
├── src/                    # Source code
│   ├── extension.ts        # Main extension entry point
│   ├── migrator/          # Core migration logic
│   │   ├── index.ts       # Module exports
│   │   ├── runner.ts      # Interactive migration runner
│   │   ├── gitHelpers.ts  # Git operations
│   │   ├── gradleFiles.ts # Gradle file processing
│   │   └── templates.ts   # Template management
│   └── tool/              # Language Model Tool integration
│       └── lmTool.ts      # LM Tool implementation
├── docs/                  # Documentation
├── test/                  # Test files
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
└── .vscode/               # VS Code settings
```

### Available Scripts

```bash
# Development
npm run watch          # Watch mode compilation
npm run compile        # One-time compilation
npm run package        # Create VSIX package

# Testing
npm test              # Run all tests
npm run test:unit     # Run unit tests
npm run test:integration # Run integration tests

# Linting and Formatting
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
npm run format        # Format with Prettier

# Documentation
npm run docs:build    # Build documentation
npm run docs:serve    # Serve documentation locally
```

## 📝 Contributing Guidelines

### Types of Contributions

We welcome several types of contributions:

- **🐛 Bug Reports**: Help us identify and fix issues
- **✨ Feature Requests**: Suggest new functionality
- **🔧 Code Contributions**: Implement features or fix bugs
- **📚 Documentation**: Improve or add documentation
- **🧪 Testing**: Add or improve test coverage
- **🎨 UI/UX**: Enhance user experience

### Before You Start

1. **Check Existing Issues**: Look for existing issues or discussions
2. **Create an Issue**: For significant changes, create an issue first
3. **Discuss Approach**: Get feedback on your proposed solution
4. **Assign Yourself**: Comment on the issue to avoid duplicate work

### Branch Naming Convention

Use descriptive branch names with prefixes:

```bash
# Features
feature/add-maven-support
feature/improve-error-handling

# Bug fixes
bugfix/fix-git-authentication
bugfix/resolve-template-parsing

# Documentation
docs/update-readme
docs/add-api-documentation

# Refactoring
refactor/simplify-migration-logic
refactor/extract-common-utilities
```

## 🔄 Pull Request Process

### 1. Preparation

```bash
# Create and switch to feature branch
git checkout -b feature/your-feature-name

# Make your changes
# ...

# Run tests
npm test

# Run linting
npm run lint

# Compile and test
npm run compile
```

### 2. Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
# Format
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

#### Examples

```bash
git commit -m "feat(migrator): add support for Gradle 8.x"
git commit -m "fix(git): resolve authentication issues with private repos"
git commit -m "docs(readme): update installation instructions"
git commit -m "test(runner): add integration tests for migration workflow"
```

### 3. Pull Request Template

When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Performance improvement

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Extension loads correctly in VS Code

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No breaking changes (or documented)
```

### 4. Review Process

1. **Automated Checks**: CI/CD pipeline runs tests and linting
2. **Code Review**: Maintainers review code quality and design
3. **Testing**: Manual testing of functionality
4. **Approval**: At least one maintainer approval required
5. **Merge**: Squash and merge to main branch

## 📏 Coding Standards

### TypeScript Guidelines

```typescript
// Use strict TypeScript settings
// Enable all strict checks in tsconfig.json

// Prefer interfaces over types for object shapes
interface MigrationOptions {
  readonly gitUrl: string;
  readonly branchName: string;
  readonly commitMessage?: string;
}

// Use meaningful names
class GradleMigrationRunner {
  async runMigration(options: MigrationOptions): Promise<MigrationResult> {
    // Implementation
  }
}

// Document public APIs
/**
 * Migrates a Gradle project to the latest standards
 * @param options - Migration configuration options
 * @returns Promise resolving to migration results
 */
export async function migrateProject(options: MigrationOptions): Promise<MigrationResult> {
  // Implementation
}
```

### Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Line Length**: Maximum 100 characters
- **Naming**: camelCase for variables/functions, PascalCase for classes

### ESLint Configuration

We use ESLint with TypeScript support:

```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

## 🧪 Testing

### Test Structure

```
test/
├── unit/              # Unit tests
│   ├── migrator/      # Migration logic tests
│   └── tool/          # Tool integration tests
├── integration/       # Integration tests
├── fixtures/          # Test data and fixtures
└── helpers/           # Test utilities
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { GradleMigrationRunner } from '../src/migrator/runner';

describe('GradleMigrationRunner', () => {
  let runner: GradleMigrationRunner;

  beforeEach(() => {
    runner = new GradleMigrationRunner();
  });

  it('should migrate gradle.properties successfully', async () => {
    // Arrange
    const options = {
      gitUrl: 'https://github.com/test/repo.git',
      branchName: 'test-migration'
    };

    // Act
    const result = await runner.runMigration(options);

    // Assert
    expect(result.success).toBe(true);
    expect(result.filesUpdated).toContain('gradle.properties');
  });
});
```

### Test Coverage

- Aim for **80%+ code coverage**
- Focus on **critical paths** and **error handling**
- Include **integration tests** for main workflows
- Test **edge cases** and **error conditions**

## 📚 Documentation

### Documentation Standards

- **README**: Keep updated with latest features
- **API Docs**: Document all public interfaces
- **Code Comments**: Explain complex logic
- **Examples**: Provide usage examples
- **Changelog**: Document all changes

### Writing Guidelines

- Use clear, concise language
- Include code examples
- Provide step-by-step instructions
- Use proper markdown formatting
- Keep documentation up-to-date

## 🚀 Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. **Update Version**: Update `package.json` version
2. **Update Changelog**: Document all changes
3. **Create Tag**: `git tag v1.2.3`
4. **Build Package**: `npm run package`
5. **Test Package**: Install and test VSIX
6. **Publish**: Release to VS Code Marketplace
7. **GitHub Release**: Create GitHub release with notes

## ❓ Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and discussions
- **Pull Request Comments**: Code-specific discussions

### Maintainer Response Times

- **Issues**: Within 48 hours
- **Pull Requests**: Within 72 hours
- **Security Issues**: Within 24 hours

## 🏆 Recognition

We appreciate all contributions! Contributors will be:

- Listed in the project's contributors section
- Mentioned in release notes for significant contributions
- Invited to join the maintainer team for consistent contributors

---

**Thank you for contributing to Gradle Migrator Extension!** 🎉

Your contributions help make Gradle migration easier for developers worldwide.