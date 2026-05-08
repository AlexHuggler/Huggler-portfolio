export const siteConfig = {
  name: "Alex Huggler",
  title: "Senior Data / Analytics Engineer",
  tagline: "Senior Data / Analytics Engineer | Open to Remote",
  valueProp:
    "I build production data platforms — streaming pipelines, lakehouse architectures, and analytics that move the needle on revenue and risk.",
  email: "REPLACE_WITH_YOUR_EMAIL@example.com",
  github: "https://github.com/alexhuggler",
  linkedin: "https://www.linkedin.com/in/alexhuggler",
  resumePath: "/alex-huggler-resume.pdf",
  location: "United States, Open to Remote",
} as const;

export type SiteConfig = typeof siteConfig;
