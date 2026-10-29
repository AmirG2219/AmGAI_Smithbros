// A recorded scope shown as written: **Area** lines in bold, "- " lines as bullets, anything else (an older or simple
// written scope) exactly as it was typed. The stored text itself is never changed.
export function ScopeText({ text }: { text: string }) {
  return (
    <div className="grid gap-0.5 text-sm">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        if (/^\*\*[^*].*\*\*$/.test(line)) return <p key={i} className="mt-1 font-medium">{line.slice(2, -2)}</p>;
        if (line.startsWith("- ")) return <p key={i} className="pl-4 -indent-3 before:mr-1.5 before:content-['•']">{line.slice(2)}</p>;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
