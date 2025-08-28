# Email Assistant Evaluation Suite

This directory contains comprehensive evaluation tests for the AI Email Assistant using [Evalite](https://github.com/evalite-ai/evalite).

## Overview

The evaluation suite tests the AI assistant's capabilities across multiple dimensions:

- **Basic Functionality**: Greetings, help requests, capability inquiries
- **Search & Retrieval**: Email search, filtering, and retrieval operations
- **Label Management**: Creating, modifying, and organizing email labels
- **Bulk Operations**: Archive, delete, mark read/unread operations
- **Email Composition**: Writing, replying, and drafting emails
- **Gmail Search**: Natural language to Gmail search query conversion
- **Web Search**: External information retrieval
- **Summarization**: Email and thread summarization
- **Organization**: Workflow automation and email organization

## Files

### `ai-chat-basic.eval.ts`
Comprehensive evaluation of the AI chat assistant covering:
- Static test cases for reliable, consistent testing
- Dynamic test case generation for varied scenarios
- Multiple scoring metrics (Factuality, EmbeddingSimilarity)
- Categorized test cases by difficulty and functionality

### `ai-tool-usage.eval.ts`
Focused evaluation of tool usage and response quality:
- Tool-specific test cases with expected behaviors
- Edge case testing and error handling
- Professional communication scenarios
- Complex workflow testing

## Running the Evals

### Prerequisites

1. **OpenAI API Key**: Set the `OPENAI_API_KEY` environment variable
2. **Dependencies**: Ensure all packages are installed (`pnpm install`)
3. **Server Access**: Navigate to the `apps/server` directory

### Commands

```bash
# Run all evals once
pnpm eval

# Run evals in watch mode (re-runs when files change)
pnpm eval:dev

# Run specific eval file
pnpm eval -- --run evals/ai-chat-basic.eval.ts
pnpm eval -- --run evals/ai-tool-usage.eval.ts
```

### Environment Setup

```bash
# Set OpenAI API key
export OPENAI_API_KEY="your-api-key-here"

# Or create a .env file in apps/server/
echo "OPENAI_API_KEY=your-api-key-here" > .env
```

## Test Case Structure

### Static Test Cases
Reliable, consistent test cases that don't change between runs:

```typescript
{
  input: "Show me my unread emails",
  expected: "getThread",
  category: "search",
  difficulty: "easy",
  description: "Simple unread email request"
}
```

### Dynamic Test Cases
AI-generated test cases for varied scenarios:

```typescript
{
  input: string,           // User request
  expected: string,        // Expected tool or behavior
  category: string,        // Test category
  difficulty: 'easy' | 'medium' | 'hard',
  description: string      // What this test validates
}
```

## Scoring Metrics

### Factuality
Measures how factually accurate the AI's responses are compared to expected outputs.

### EmbeddingSimilarity
Uses semantic similarity to evaluate how well the AI's response matches the expected behavior.

### Levenshtein
String similarity scoring for exact text matching (when applicable).

## Test Categories

### Basic Functionality
- Greetings and help requests
- Capability inquiries
- User intent recognition

### Search & Retrieval
- Email search with filters
- Date-based queries
- Multi-criteria searches

### Label Management
- Label creation and modification
- Label organization
- Label application

### Bulk Operations
- Archive operations
- Delete operations
- Mark read/unread operations

### Email Composition
- Professional emails
- Personal communication
- Context-aware composition

### Gmail Search
- Natural language conversion
- Search operator usage
- Complex query building

### Web Search
- External information retrieval
- Current events
- Fact checking

### Summarization
- Email summarization
- Thread summarization
- Content extraction

### Organization
- Workflow automation
- Email organization
- Priority management

## Difficulty Levels

### Easy
- Simple, single-action requests
- Basic tool usage
- Clear, unambiguous inputs

### Medium
- Multi-step operations
- Combined tool usage
- Moderate complexity

### Hard
- Complex workflows
- Edge cases
- Error handling scenarios

## Customization

### Adding New Test Cases

1. **Static Cases**: Add to the appropriate `STATIC_TEST_CASES` array
2. **Dynamic Cases**: Modify the test case builder functions
3. **New Categories**: Update the category filtering and add new evalite blocks

### Modifying Scoring

Adjust the scorers array in each evalite block:

```typescript
scorers: [Factuality, EmbeddingSimilarity, Levenshtein]
```

### Adding New Prompts

Import new system prompts and create corresponding evalite blocks:

```typescript
import { NewPrompt } from "../src/lib/prompts";

evalite("New Prompt Evaluation", {
  data: makeTestCaseBuilder("new functionality"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: NewPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, EmbeddingSimilarity],
});
```

## Troubleshooting

### Common Issues

1. **SQLite Binding Errors**: Run `pnpm rebuild better-sqlite3`
2. **Missing API Key**: Ensure `OPENAI_API_KEY` is set
3. **Import Errors**: Check that all prompt imports are correct

### Performance Tips

1. **Use Static Cases**: For consistent, reliable testing
2. **Limit Dynamic Cases**: Balance coverage with execution time
3. **Watch Mode**: Use `pnpm eval:dev` for development iterations

## Expected Scores

- **Easy Cases**: 70-90% (basic functionality should work well)
- **Medium Cases**: 50-80% (moderate complexity may have variations)
- **Hard Cases**: 30-70% (complex scenarios may be challenging)

Scores above 70% indicate excellent performance, while scores below 50% suggest areas for improvement.

## Contributing

When adding new test cases:

1. **Follow the existing structure** and naming conventions
2. **Add comprehensive descriptions** for each test case
3. **Use appropriate difficulty levels** based on complexity
4. **Test edge cases** and error scenarios
5. **Document any new categories** or scoring methods

## Resources

- [Evalite Documentation](https://github.com/evalite-ai/evalite)
- [Autoevals Library](https://github.com/braintrustdata/autoevals)
- [AI SDK Documentation](https://sdk.vercel.ai/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
