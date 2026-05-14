import Navigation from "@/components/Navigation";
import NLSQLDemo from "@/components/demos/NLSQLDemo";

export const metadata = {
  title: "NL → SQL Demo",
  description: "Type a business question, get a production-ready SQL query.",
};

export default function NLSQLPage() {
  return (
    <>
      <Navigation />
      <main className="page-pad">
        <div className="shell flex flex-col gap-8" style={{ minHeight: "calc(100vh - 7.25rem)" }}>
          <section className="max-w-2xl">
            <p className="kicker mb-3">Project Demo · GenAI Analytics Agent</p>
            <h1 className="heading-lg font-semibold">
              Natural Language
              <br />
              <span style={{ color: "var(--accent)" }}>to SQL</span>
            </h1>
            <p className="body-lg mt-4">
              Ask a business question in plain English. Llama 3.3 70B translates it into
              production-ready Redshift SQL — live, streamed token by token.
            </p>
          </section>

          <div className="flex-1">
            <NLSQLDemo />
          </div>
        </div>
      </main>
    </>
  );
}
