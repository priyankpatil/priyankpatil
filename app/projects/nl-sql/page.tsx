import Navigation from "@/components/Navigation";
import NLSQLDemo from "@/components/demos/NLSQLDemo";

export const metadata = {
  title: "NL → SQL Demo",
  description: "Ask a business question; a RAG pipeline writes, validates and runs the SQL against live sample data.",
};

export default function NLSQLPage() {
  return (
    <>
      <Navigation />
      <main className="page-pad">
        <div className="shell flex flex-col gap-8 min-h-[calc(100vh-7.25rem)]">
          <section className="max-w-2xl">
            <p className="kicker mb-3">Project Demo · GenAI Analytics Agent</p>
            <h1 className="heading-lg font-semibold">
              Natural Language
              <br />
              <span className="text-accent">to SQL</span>
            </h1>
            <p className="body-lg mt-4">
              Ask a business question in plain English. The system retrieves the relevant schema, business
              definitions and verified examples from a pgvector knowledge base, writes PostgreSQL with an open-weight
              model, validates it, and runs it read-only against 40,000+ rows of synthetic pharmacy data.
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
