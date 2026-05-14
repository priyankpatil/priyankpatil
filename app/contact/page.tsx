import Navigation from "@/components/Navigation";

export const metadata = {
  title: "Contact",
  description: "Contact Priyank Patil for analytics leadership and data product collaborations.",
};

const contactLinks = [
  {
    label: "Email",
    value: "priyank.patil3@gmail.com",
    href: "mailto:priyank.patil3@gmail.com",
    note: "Best for project discussions",
  },
  {
    label: "LinkedIn",
    value: "linkedin.com/in/priyank-patil",
    href: "https://www.linkedin.com/in/priyank-patil",
    note: "Career and collaboration conversations",
  },
  {
    label: "GitHub",
    value: "github.com/priyankpatil",
    href: "https://github.com/priyankpatil",
    note: "Technical work and experiments",
  },
];

export default function ContactPage() {
  return (
    <>
      <Navigation />
      <main className="page-scroll">
        <section className="scroll-chapter">
          <div className="shell max-w-3xl">
            <p className="kicker mb-4">Contact</p>
            <h1 className="heading-lg font-semibold">Let&apos;s build the next analytics capability together.</h1>
            <p className="body-lg mt-5">
              If you are shaping a new data platform, operational analytics product, or AI-enabled decision workflow, I am
              happy to collaborate.
            </p>
            <p className="mt-8 text-xs uppercase tracking-[0.2em]" style={{ color: "var(--soft)" }}>
              Scroll for contact options
            </p>
          </div>
        </section>

        <section className="scroll-chapter top">
          <div className="shell grid gap-4">
            {contactLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="panel block p-6 md:p-7"
              >
                <div className="grid gap-2 md:grid-cols-[130px_1fr_auto] md:items-center">
                  <p className="kicker">{item.label}</p>
                  <p className="text-lg font-semibold tracking-tight md:text-2xl" style={{ color: "var(--text)" }}>
                    {item.value}
                  </p>
                  <p className="text-xs" style={{ color: "var(--soft)" }}>
                    {item.note}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
