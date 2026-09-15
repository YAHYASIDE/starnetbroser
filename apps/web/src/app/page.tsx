import { HomeView } from "@/components/HomeView";
import { demoAccounts } from "@/lib/demoData";
import { BuildInfo } from "@/components/BuildInfo";

const IS_DEMO = process.env.NEXT_PUBLIC_DATA_SOURCE !== "api";

export default function HomePage() {
  return (
    <>
      {IS_DEMO && (
        <div className="demo-banner">
          معاينة تجريبية ببيانات وهمية — لا توجد بيانات عملاء حقيقية هنا
        </div>
      )}
      <HomeView accounts={demoAccounts} />
      <BuildInfo />
    </>
  );
}
