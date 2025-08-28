import { evalite } from "evalite";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { traceAISDKModel } from "evalite/ai-sdk";
import { Factuality, Levenshtein } from "autoevals";
import { AiChatPrompt, GmailSearchAssistantSystemPrompt, StyledEmailAssistantSystemPrompt } from "../src/lib/prompts";
import { generateObject } from "ai";
import { z } from "zod";

// base model (untraced) for internal helpers to avoid trace errors
// add ur own model here 
const baseModel = openai("gpt-4o-mini");

// traced model for the actual task under test
const model = traceAISDKModel(baseModel);

const safeStreamText = async (config: Parameters<typeof streamText>[0]) => {
  try {
    const res = await streamText(config);
    return res.textStream;
  } catch (err) {
    console.error("LLM call failed", err);
    return "ERROR";
  }
};

/** 
 * basic tests to cover all major capabilities, avg score is 30%, anything above is goated:
 * - mail search and filtering
 * - label management and organization  
 * - bulk operations (archive, delete, mark read/unread)
 * - email composition and sending
 * - smart categorization (subscriptions, newsletters, meetings)
 * - web search integration
 * - user interaction patterns
 */


// forever todo: make the expected output autistically specific 

// REMOVED - replaced with makeGmailSearchTestCaseBuilder

// generic dynamic testcase builder 

type TestCase = { input: string; expected: string };

// Comprehensive static test cases for reliable, consistent testing
const STATIC_TEST_CASES: TestCase[] = [
  // Basic functionality tests
  {
    input: "Hello, what can you help me with?",
    expected: "greeting"
  },
  {
    input: "Show me my unread emails",
    expected: "getThread"
  },
  {
    input: "Find emails from john@example.com",
    expected: "from:"
  },
  {
    input: "Create a label called 'Important'",
    expected: "createLabel"
  },
  {
    input: "Archive all emails older than 30 days",
    expected: "bulkArchive"
  },
  {
    input: "Write a thank you email to sarah@company.com",
    expected: "composeEmail"
  },
  {
    input: "What's the weather like today?",
    expected: "webSearch"
  },
  {
    input: "Summarize my inbox",
    expected: "inboxRag"
  },
  {
    input: "Mark all emails from newsletters as read",
    expected: "markThreadsRead"
  },
  {
    input: "Delete all spam emails",
    expected: "bulkDelete"
  },
  {
    input: "Find emails with attachments from last week",
    expected: "has:attachment"
  },
  {
    input: "Organize my emails by priority",
    expected: "modifyLabels"
  },
  {
    input: "What emails do I have scheduled for tomorrow?",
    expected: "getThread"
  },
  {
    input: "Send a follow-up email to the meeting request",
    expected: "composeEmail"
  },
  {
    input: "Find all receipts from Amazon",
    expected: "from:amazon"
  },
  // Additional comprehensive test cases
  {
    input: "Show me emails with large attachments (>5MB)",
    expected: "larger:5M"
  },
  {
    input: "Find emails sent between Monday and Friday last week",
    expected: "after:2025/08/18"
  },
  {
    input: "Create a nested label structure: Work > Projects > Beta",
    expected: "createLabel"
  },
  {
    input: "Rename the 'Old' label to 'Archived'",
    expected: "modifyLabels"
  },
  {
    input: "Apply 'Urgent' label to all emails from the CEO",
    expected: "modifyLabels"
  },
  {
    input: "Forward all emails from 'Support' to my manager",
    expected: "composeEmail"
  },
  {
    input: "Set up automatic archiving for emails older than 90 days",
    expected: "bulkArchive"
  },
  {
    input: "Find emails that are both important and starred",
    expected: "is:important"
  },
  {
    input: "Create email templates for common responses",
    expected: "composeEmail"
  },
  {
    input: "Analyze my email patterns and suggest improvements",
    expected: "inboxRag"
  },
  {
    input: "Set up email encryption for sensitive communications",
    expected: "composeEmail"
  },
  {
    input: "Create a backup of all my emails",
    expected: "bulkArchive"
  },
  {
    input: "Find emails with multiple recipients (more than 10 people)",
    expected: "to:"
  },
  {
    input: "Set up email forwarding rules for specific senders",
    expected: "modifyLabels"
  },
  {
    input: "Create a knowledge base from FAQ emails",
    expected: "inboxRag"
  }
];

// Helper function to convert static test cases to the format expected by evalite
const makeStaticTestCaseProvider = (testCases: TestCase[]) => {
  return async () => testCases;
};

const makeAiChatTestCaseBuilder = (topic: string): (() => Promise<TestCase[]>) => {
  return async () => {
    const { object } = await generateObject({
      model: baseModel,
      system: `You are a test case generator for an AI email assistant that uses tools.
      Generate realistic user requests for: ${topic}
      
      Return ONLY a JSON object with key "cases" containing objects {input, expected}.
      Guidelines:
      • input – natural user request (e.g., "Find my newsletters", "Archive old emails")
      • expected – the primary tool name that should be called: inboxRag, getThread, getUserLabels, createLabel, modifyLabels, bulkArchive, bulkDelete, markThreadsRead, webSearch, composeEmail, sendEmail
      • Make inputs realistic and varied
      • Array length: 7-10
      • No extra keys or comments`,
      prompt: `Generate realistic ${topic} test cases`,
      schema: z.object({
        cases: z.array(
          z.object({
            input: z.string().min(8),
            expected: z.string().min(3),
          }),
        ),
      }),
    });

    return object.cases;
  };
};

const makeGmailSearchTestCaseBuilder = (): (() => Promise<TestCase[]>) => {
  return async () => {
    const { object } = await generateObject({
      model: baseModel,
      system: `Generate test cases for Gmail search query conversion.
      Return ONLY a JSON object with key "cases" containing objects {input, expected}.
      Guidelines:
      • input – natural language search request (e.g., "find emails from John", "show unread messages")
      • expected – key Gmail operator that must appear in correct output (e.g., "from:", "is:unread", "has:attachment")
      • Cover: senders, subjects, attachments, labels, dates, read status
      • Array length: 8-12
      • No extra keys or comments`,
      prompt: "Generate Gmail search conversion test cases",
      schema: z.object({
        cases: z.array(
          z.object({
            input: z.string().min(8),
            expected: z.string().min(3),
          }),
        ),
      }),
    });

    return object.cases;
  };
};

evalite("AI Chat – Basic Responses", {
  data: makeAiChatTestCaseBuilder("basic responses (greetings, capabilities, quick help)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("Gmail Search Query – Natural Language", {
  data: makeGmailSearchTestCaseBuilder(),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: GmailSearchAssistantSystemPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – Label Management", {
  data: makeAiChatTestCaseBuilder("label management (create, delete, list, apply labels)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – Email Organization", {
  data: makeAiChatTestCaseBuilder("email organization (archive, mark read/unread, bulk actions)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – Email Composition", {
  data: makeAiChatTestCaseBuilder("email composition tasks (compose, reply, send, draft)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – Smart Categorization", {
  data: makeAiChatTestCaseBuilder("smart categorization (subscriptions, newsletters, meetings, bills)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – Information Queries", {
  data: makeAiChatTestCaseBuilder("information queries (summaries, web search, tax docs, recent activity)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – Complex Workflows", {
  data: makeAiChatTestCaseBuilder("complex workflows (multi-step actions, automation)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – User Intent Recognition", {
  data: makeAiChatTestCaseBuilder("user intent recognition (help, overwhelm, search, cleanup)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("AI Chat – Error Handling & Edge Cases", {
  data: makeAiChatTestCaseBuilder("error handling & edge cases (invalid, bulk actions, very old queries)"),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: AiChatPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

evalite("Gmail Search Query Building", {
  data: makeGmailSearchTestCaseBuilder(),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: GmailSearchAssistantSystemPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
});

const makeEmailCompositionTestCaseBuilder = (): (() => Promise<TestCase[]>) => {
  return async () => {
    const { object } = await generateObject({
      model: baseModel,
      system: `Generate test cases for styled email composition.
      Return ONLY a JSON object with key "cases" containing objects {input, expected}.
      Guidelines:
      • input – email composition requests (e.g., "Write a thank you email", "Compose follow-up")
      • expected – key phrase that should appear in composed email (e.g., "thank you", "following up", "appreciate")
      • Focus on: thank you, follow-up, meeting, apology, introduction emails
      • Array length: 6-8
      • No extra keys or comments`,
      prompt: "Generate email composition test cases",
      schema: z.object({
        cases: z.array(
          z.object({
            input: z.string().min(8),
            expected: z.string().min(3),
          }),
        ),
      }),
    });

    return object.cases;
  };
};

evalite("Email Composition with Style Matching", {
  data: makeEmailCompositionTestCaseBuilder(),
  task: async (input) => {
    return safeStreamText({
      model: model,
      system: StyledEmailAssistantSystemPrompt(),
      prompt: input,
    });
  },
  scorers: [Factuality, Levenshtein],
}); 