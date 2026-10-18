// A template (unlike a layout) is created fresh on every navigation, so each page gently fades in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
