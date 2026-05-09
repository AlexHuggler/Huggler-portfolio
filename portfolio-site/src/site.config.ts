export const siteConfig = {
  name: "Alex Huggler",
  title: "Senior Data / Analytics Engineer",
  tagline: "Senior Data Engineer · Analytics Engineering · Fraud & Revenue Data Platforms",
  valueProp:
    "I build production-grade data platforms that reduce fraud loss, improve revenue visibility, and turn ambiguous business problems into reliable analytics systems.",
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
