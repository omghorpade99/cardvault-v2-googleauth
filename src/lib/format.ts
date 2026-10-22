export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";
