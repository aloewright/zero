#!/bin/bash

# Email Assistant Evaluation Runner
# This script helps run specific evals with better output formatting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "evals" ]]; then
    print_error "Please run this script from the apps/server directory"
    exit 1
fi

# Check if OpenAI API key is set
if [[ -z "$OPENAI_API_KEY" ]]; then
    print_warning "OPENAI_API_KEY not set. Checking .dev.vars file..."
    if [[ -f ".dev.vars" ]]; then
        source .dev.vars
        print_success "Loaded environment variables from .dev.vars"
    else
        print_error "OPENAI_API_KEY not set and .dev.vars not found"
        print_status "Please set OPENAI_API_KEY environment variable or create .dev.vars file"
        exit 1
    fi
fi

# Function to run a specific eval
run_eval() {
    local eval_file=$1
    local eval_name=$(basename "$eval_file" .eval.ts)
    
    print_status "Running eval: $eval_name"
    echo "=================================================="
    
    # Use the correct evalite syntax with run-once command
    if pnpm eval run-once "$eval_file"; then
        print_success "Eval completed successfully: $eval_name"
    else
        print_error "Eval failed: $eval_name"
        return 1
    fi
    
    echo "=================================================="
    echo
}

# Function to run all evals
run_all_evals() {
    print_status "Running all evals..."
    echo "=================================================="
    
    if pnpm eval run-once; then
        print_success "All evals completed successfully"
    else
        print_error "Some evals failed"
        return 1
    fi
    
    echo "=================================================="
}

# Function to run evals in watch mode
run_watch_mode() {
    print_status "Starting evals in watch mode..."
    print_status "Press Ctrl+C to stop"
    
    pnpm eval watch
}

# Function to show available evals
show_available_evals() {
    print_status "Available eval files:"
    echo
    for file in evals/*.eval.ts; do
        if [[ -f "$file" ]]; then
            local name=$(basename "$file" .eval.ts)
            echo "  • $name"
        fi
    done
    echo
}

# Function to show help
show_help() {
    echo "Email Assistant Evaluation Runner"
    echo
    echo "Usage: $0 [OPTION] [EVAL_FILE]"
    echo
    echo "Options:"
    echo "  -a, --all           Run all evals"
    echo "  -w, --watch         Run evals in watch mode"
    echo "  -l, --list          List available eval files"
    echo "  -h, --help          Show this help message"
    echo
    echo "Examples:"
    echo "  $0                                    # Run all evals"
    echo "  $0 -a                                # Run all evals"
    echo "  $0 -w                                # Run in watch mode"
    echo "  $0 evals/ai-chat-basic.eval.ts       # Run specific eval"
    echo "  $0 -l                                # List available evals"
    echo
}

# Main script logic
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -l|--list)
        show_available_evals
        exit 0
        ;;
    -a|--all)
        run_all_evals
        ;;
    -w|--watch)
        run_watch_mode
        ;;
    "")
        print_status "No arguments provided, running all evals..."
        run_all_evals
        ;;
    *)
        # Check if the file exists
        if [[ -f "$1" ]]; then
            run_eval "$1"
        else
            print_error "Eval file not found: $1"
            print_status "Use -l or --list to see available evals"
            exit 1
        fi
        ;;
esac

print_success "Evaluation run completed!"
