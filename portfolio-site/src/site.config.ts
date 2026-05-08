export const siteConfig = {
  name: "Alex Huggler",
  title: "Senior Data / Analytics Engineer",
  tagline: "Senior Data / Analytics Engineer",
  valueProp:
    "I build production data platforms — streaming pipelines, lakehouse architectures, and analytics that move the needle on revenue and risk.",
  email: "alexhuggler@gmail.com",
  github: "https://github.com/AlexHuggler",
  githubRepo: "https://github.com/AlexHuggler/Huggler-portfolio",
  linkedin: "https://www.linkedin.com/in/alexhuggler",
  resumePath: "/Alexandre_Huggler_Resume.pdf",
  location: "Dallas, TX",
  url: "https://www.alexhuggler.com",
  contactFormEndpoint: "https://formsubmit.co/alexhuggler@gmail.com",
} as const;

export type SiteConfig = typeof siteConfig;
