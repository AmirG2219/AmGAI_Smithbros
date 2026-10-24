// The colours of the inbox, in one place. Soft tints on the brand's warm palette: easy to scan, never loud.

// What kind of email it is. Each kind has a tinted label and a matching accent.
export const CATEGORY: Record<string, { label: string; chip: string; dot: string }> = {
  lead_reply: { label: "Lead reply", chip: "bg-[#F6E9C8] text-[#8A5F0F]", dot: "bg-[#D19B38]" },
  customer_question: { label: "Customer question", chip: "bg-[#E3EAF2] text-[#3F5F7F]", dot: "bg-[#5B83A6]" },
  scheduling: { label: "Scheduling", chip: "bg-[#E4EEE3] text-[#476B45]", dot: "bg-[#6E9A6B]" },
  quote_or_contract: { label: "Quote or contract", chip: "bg-[#F1E4D6] text-[#855A33]", dot: "bg-[#A87D53]" },
  invoice_or_payment: { label: "Invoice or payment", chip: "bg-[#EEE3EC] text-[#6E4A68]", dot: "bg-[#9B6B93]" },
  supplier: { label: "Supplier", chip: "bg-[#E9E6DF] text-[#5E574D]", dot: "bg-[#8A8275]" },
  spam_or_marketing: { label: "Marketing", chip: "bg-[#ECEAE6] text-[#7A746B]", dot: "bg-[#B5AFA5]" },
  other: { label: "Other", chip: "bg-[#ECEAE6] text-[#6B645B]", dot: "bg-[#A39C91]" },
};
export const categoryOf = (c: string | null) => (c && CATEGORY[c]) || null;

// How urgent it is: the coloured edge of the row, and the matching label.
export const PRIORITY: Record<string, { label: string; edge: string; chip: string }> = {
  urgent: { label: "Urgent", edge: "before:bg-[#C2482F]", chip: "bg-[#F8E1DB] text-[#A23A25]" },
  high: { label: "High", edge: "before:bg-[#D19B38]", chip: "bg-[#F8EBCB] text-[#8A5F0F]" },
  normal: { label: "Normal", edge: "before:bg-transparent", chip: "bg-line text-muted" },
  low: { label: "Low", edge: "before:bg-transparent", chip: "bg-line text-muted" },
};
export const priorityOf = (p: string | null) => PRIORITY[p ?? "normal"] ?? PRIORITY.normal;
