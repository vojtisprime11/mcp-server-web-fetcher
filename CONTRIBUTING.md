# Contributing to MCP Server Web Fetcher

Thank you for considering contributing to MCP Server Web Fetcher! This document provides guidelines and instructions for contributing.

## 🤝 How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (Node.js version, OS, etc.)
- Any relevant error messages or logs

### Suggesting Features

Feature suggestions are welcome! Please create an issue with:
- Clear description of the feature
- Use case and motivation
- Examples of how it would work
- Any implementation ideas you have

### Pull Requests

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/mcp-server-web-fetcher.git
   cd mcp-server-web-fetcher
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Make Your Changes**
   - Write clean, readable code
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

5. **Run Tests**
   ```bash
   npm test
   npm run build
   npm run lint
   ```

6. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test additions or changes
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

7. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a Pull Request on GitHub.

## 📝 Code Style

- Use TypeScript strict mode
- Follow ESLint and Prettier configurations
- Write meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

## 🧪 Testing

- Write unit tests for all new features
- Aim for high test coverage
- Test both success and error cases
- Use descriptive test names

Example:
```typescript
describe("fetchPageMarkdown", () => {
  it("converts HTML to Markdown successfully", async () => {
    // Test implementation
  });

  it("handles HTTP errors gracefully", async () => {
    // Test implementation
  });
});
```

## 📚 Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for code documentation
- Include examples for new features
- Update CHANGELOG.md (if exists)

## ✅ Review Process

1. All tests must pass
2. Code must follow style guidelines
3. Documentation must be updated
4. At least one maintainer approval required
5. No merge conflicts

## 🙏 Thank You

Your contributions make this project better for everyone!
