import { HomeView } from "@/components/HomeView";
import { demoAccounts } from "@/lib/demoData";
import { BuildInfo } from "@/components/BuildInfo";

export default function HomePage() {
  return (
    <>
      <HomeView accounts={demoAccounts} />
      <BuildInfo />
    </>
  );
}
