import { redirect } from "next/navigation";

export default function Contracts() {
  redirect("/agreements?type=work_contract");
}
