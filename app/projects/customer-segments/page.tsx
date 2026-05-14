import Navigation from "@/components/Navigation";
import CustomerSegmentDemo from "@/components/demos/CustomerSegmentDemo";

export const metadata = {
  title: "Customer Segment Classifier",
  description: "Client-side ML classifier that segments customers in real time.",
};

export default function CustomerSegmentsPage() {
  return (
    <>
      <Navigation />
      <main className="page-pad">
        <div className="shell flex flex-col gap-8" style={{ minHeight: "calc(100vh - 7.25rem)" }}>
          <section className="max-w-2xl">
            <p className="kicker mb-3">Project Demo · Customer Stratification</p>
            <h1 className="heading-lg font-semibold">
              Customer Segment
              <br />
              <span style={{ color: "var(--accent)" }}>Classifier</span>
            </h1>
            <p className="body-lg mt-4">
              A nearest-centroid model trained on 220 synthetic customers. Adjust the sliders
              to classify any customer in real time — inference runs entirely in your browser,
              no server call.
            </p>
          </section>

          <div className="flex-1">
            <CustomerSegmentDemo />
          </div>
        </div>
      </main>
    </>
  );
}
