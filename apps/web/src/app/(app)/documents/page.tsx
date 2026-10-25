import { redirect } from "next/navigation";

// Documents now live in one place: Agreements.
export default function Documents() {
  redirect("/agreements");
}
