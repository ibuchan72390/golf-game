// src/course/curated.ts
export interface CuratedCourse {
  name: string;
  seed: number;
}

/** Curated 9-hole courses: hand-picked generator seeds. (More is a later pass.) */
export const CURATED_COURSES: CuratedCourse[] = [
  { name: 'Seagrass Links', seed: 2 },
];
