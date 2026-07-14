// dark:prose-invert (not bare prose-invert): the app has a light theme, and an
// unconditional invert renders near-white text on the light background.
// prose-pre scrolls horizontally instead of wrapping: pre-wrap mangled code
// indentation and broke copy-paste of anything whitespace-sensitive.
export const PROSE_CLASSES =
  "prose prose-sm dark:prose-invert max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-medium prose-strong:font-medium prose-p:my-2 prose-headings:my-3 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:overflow-x-auto prose-code:text-foreground/80 prose-a:text-primary";
