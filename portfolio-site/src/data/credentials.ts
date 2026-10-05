/** Certifications and education, as listed on the résumé. */

export interface Certification {
  code: string;
  name: string;
  issuer: string;
}

export interface Degree {
  school: string;
  degree: string;
  field: string;
  honors: string;
}

export const certifications: Certification[] = [
  { code: "DP-203", name: "Azure Data Engineer Associate", issuer: "Microsoft" },
  { code: "DP-100", name: "Azure Data Scientist Associate", issuer: "Microsoft" },
];

export const education: Degree[] = [
  {
    school: "The University of Texas at Dallas",
    degree: "M.S.",
    field: "Business Analytics",
    honors: "Scholar with Recognition",
  },
  {
    school: "The University of Texas at San Antonio",
    degree: "B.B.A.",
    field: "Economics",
    honors: "Magna cum laude",
  },
];
