import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CertStatus = "planejada" | "estudando" | "obtida" | "expirada";
export type CourseStatus = "planejado" | "em_andamento" | "concluido";
export type CoursePriceType = "gratuito" | "pago" | "assinatura";
export type CourseFormat = "video" | "hands_on" | "livro" | "doc";
export type CertDifficulty = "iniciante" | "intermediario" | "avancado" | "especialista";

export interface CertCatalogItem {
  id: string;
  name: string;
  issuer: string;
  level: string | null;
  trackIds: string[];
  skillIds: string[];
  officialUrl: string | null;
  costUsd: number | null;
  examDurationMin: number | null;
  validityMonths: number | null;
  difficulty: CertDifficulty | null;
  gapImpact: number;
  userStatus: CertStatus | null;
  userCertId: string | null;
  expiresAt: string | null;
  /** true quando a certificação do usuário vence nos próximos 90 dias. */
  expiringAlert: boolean;
}

export interface CourseCatalogItem {
  id: string;
  title: string;
  provider: string;
  url: string | null;
  trackIds: string[];
  skillIds: string[];
  format: CourseFormat | null;
  priceType: CoursePriceType | null;
  durationHours: number | null;
  language: string;
  level: string | null;
  rating: number | null;
  gapImpact: number;
  userStatus: CourseStatus | null;
  userCourseId: string | null;
  progressPercent: number;
}

export interface UserCert {
  id: string;
  certId: string | null;
  customName: string | null;
  name: string;
  issuer: string | null;
  status: CertStatus;
  obtainedAt: string | null;
  expiresAt: string | null;
  credentialUrl: string | null;
  credentialId: string | null;
  expiringAlert: boolean;
}

export interface UserCourse {
  id: string;
  courseId: string | null;
  customTitle: string | null;
  title: string;
  provider: string | null;
  status: CourseStatus;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  certificateUrl: string | null;
}

// ─── Certifications Catalog ──────────────────────────────────────────────────

export const getCertsCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trackId: string }) => input)
  .handler(async ({ data, context }): Promise<CertCatalogItem[]> => {
    const { supabase, userId } = context;

    const [{ data: certs }, { data: userCerts }] = await Promise.all([
      supabase.from("certifications_catalog").select("*").contains("track_ids", [data.trackId]),
      supabase
        .from("user_certifications")
        .select("id, certification_id, status, expires_at")
        .eq("user_id", userId),
    ]);

    const userMap = new Map((userCerts ?? []).map((u) => [u.certification_id, u] as const));

    return (certs ?? []).map((c) => {
      const uc = userMap.get(c.id);
      const expiresAt = uc?.expires_at ?? null;
      const daysToExpiry = expiresAt
        ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
        : null;
      return {
        id: c.id as string,
        name: c.name as string,
        issuer: c.issuer as string,
        level: (c.level as string | null) ?? null,
        trackIds: (c.track_ids as string[]) ?? [],
        skillIds: (c.skill_ids as string[]) ?? [],
        officialUrl: (c.official_url as string | null) ?? null,
        costUsd: (c.cost_usd as number | null) ?? null,
        examDurationMin: (c.exam_duration_min as number | null) ?? null,
        validityMonths: (c.validity_months as number | null) ?? null,
        difficulty: (c.difficulty as CertDifficulty | null) ?? null,
        gapImpact: 0,
        userStatus: uc ? (uc.status as CertStatus) : null,
        userCertId: uc ? (uc.id as string) : null,
        expiresAt,
        expiringAlert: daysToExpiry !== null && daysToExpiry <= 90 && daysToExpiry > 0,
      };
    });
  });

// ─── Courses Catalog ──────────────────────────────────────────────────────────

export const getCoursesCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trackId: string }) => input)
  .handler(async ({ data, context }): Promise<CourseCatalogItem[]> => {
    const { supabase, userId } = context;

    const [{ data: courses }, { data: userCourses }] = await Promise.all([
      supabase.from("courses_catalog").select("*").contains("track_ids", [data.trackId]),
      supabase
        .from("user_courses")
        .select("id, course_id, status, progress_percent")
        .eq("user_id", userId),
    ]);

    const userMap = new Map((userCourses ?? []).map((u) => [u.course_id, u] as const));

    return (courses ?? []).map((c) => {
      const uc = userMap.get(c.id);
      return {
        id: c.id as string,
        title: c.title as string,
        provider: c.provider as string,
        url: (c.url as string | null) ?? null,
        trackIds: (c.track_ids as string[]) ?? [],
        skillIds: (c.skill_ids as string[]) ?? [],
        format: (c.format as CourseFormat | null) ?? null,
        priceType: (c.price_type as CoursePriceType | null) ?? null,
        durationHours: (c.duration_hours as number | null) ?? null,
        language: c.language as string,
        level: (c.level as string | null) ?? null,
        rating: (c.rating as number | null) ?? null,
        gapImpact: 0,
        userStatus: uc ? (uc.status as CourseStatus) : null,
        userCourseId: uc ? (uc.id as string) : null,
        progressPercent: uc ? ((uc.progress_percent as number) ?? 0) : 0,
      };
    });
  });

// ─── User Certifications ──────────────────────────────────────────────────────

export const getUserCerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<UserCert[]> => {
    const { userId } = context;
    const db = context.supabase;
    const { data, error } = await db
      .from("user_certifications")
      .select(
        "id, certification_id, custom_name, status, obtained_at, expires_at, credential_url, credential_id, certifications_catalog(name, issuer)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const now = Date.now();
    return (data ?? []).map((r) => {
      const cat = r.certifications_catalog as { name: string; issuer: string } | null;
      const expiresAt = (r.expires_at as string | null) ?? null;
      const daysToExpiry = expiresAt
        ? Math.ceil((new Date(expiresAt).getTime() - now) / 86400000)
        : null;
      return {
        id: r.id as string,
        certId: (r.certification_id as string | null) ?? null,
        customName: (r.custom_name as string | null) ?? null,
        name: cat?.name ?? (r.custom_name as string) ?? "—",
        issuer: cat?.issuer ?? null,
        status: r.status as CertStatus,
        obtainedAt: (r.obtained_at as string | null) ?? null,
        expiresAt,
        credentialUrl: (r.credential_url as string | null) ?? null,
        credentialId: (r.credential_id as string | null) ?? null,
        expiringAlert: daysToExpiry !== null && daysToExpiry <= 90 && daysToExpiry > 0,
      };
    });
  });

interface UpsertUserCertInput {
  certId?: string;
  customName?: string;
  status: CertStatus;
  obtainedAt?: string;
  expiresAt?: string;
  credentialUrl?: string;
  credentialId?: string;
  existingId?: string;
}

export const upsertUserCert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsertUserCertInput) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const row = {
      user_id: context.userId,
      status: data.status,
      ...(data.certId ? { certification_id: data.certId } : {}),
      ...(data.customName ? { custom_name: data.customName } : {}),
      ...(data.obtainedAt ? { obtained_at: data.obtainedAt } : {}),
      ...(data.expiresAt ? { expires_at: data.expiresAt } : {}),
      ...(data.credentialUrl ? { credential_url: data.credentialUrl } : {}),
      ...(data.credentialId ? { credential_id: data.credentialId } : {}),
    };

    if (data.existingId) {
      const { error } = await db.from("user_certifications").update(row).eq("id", data.existingId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("user_certifications").insert(row);
      if (error) throw new Error(error.message);
    }
  });

export const deleteUserCert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const { error } = await db
      .from("user_certifications")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
  });

// ─── User Courses ─────────────────────────────────────────────────────────────

export const getUserCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<UserCourse[]> => {
    const { userId } = context;
    const db = context.supabase;
    const { data, error } = await db
      .from("user_courses")
      .select(
        "id, course_id, custom_title, status, progress_percent, started_at, completed_at, certificate_url, courses_catalog(title, provider)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const cat = r.courses_catalog as { title: string; provider: string } | null;
      return {
        id: r.id as string,
        courseId: (r.course_id as string | null) ?? null,
        customTitle: (r.custom_title as string | null) ?? null,
        title: cat?.title ?? (r.custom_title as string) ?? "—",
        provider: cat?.provider ?? null,
        status: r.status as CourseStatus,
        progressPercent: (r.progress_percent as number) ?? 0,
        startedAt: (r.started_at as string | null) ?? null,
        completedAt: (r.completed_at as string | null) ?? null,
        certificateUrl: (r.certificate_url as string | null) ?? null,
      };
    });
  });

interface UpsertUserCourseInput {
  courseId?: string;
  customTitle?: string;
  status: CourseStatus;
  progressPercent?: number;
  startedAt?: string;
  completedAt?: string;
  certificateUrl?: string;
  existingId?: string;
}

export const upsertUserCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsertUserCourseInput) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const row = {
      user_id: context.userId,
      status: data.status,
      ...(data.courseId ? { course_id: data.courseId } : {}),
      ...(data.customTitle ? { custom_title: data.customTitle } : {}),
      ...(data.progressPercent !== undefined ? { progress_percent: data.progressPercent } : {}),
      ...(data.startedAt ? { started_at: data.startedAt } : {}),
      ...(data.completedAt ? { completed_at: data.completedAt } : {}),
      ...(data.certificateUrl ? { certificate_url: data.certificateUrl } : {}),
    };

    if (data.existingId) {
      const { error } = await db.from("user_courses").update(row).eq("id", data.existingId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("user_courses").insert(row);
      if (error) throw new Error(error.message);
    }
  });

export const deleteUserCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const { error } = await db
      .from("user_courses")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
  });

// ─── Add to study plan ────────────────────────────────────────────────────────

export const addLearningItemToStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      planId: string;
      title: string;
      type: "curso" | "certificacao";
      resourceUrl?: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const { error } = await db.from("study_items").insert({
      plan_id: data.planId,
      user_id: context.userId,
      title: data.title,
      type: data.type,
      status: "backlog",
      ...(data.resourceUrl ? { resource_url: data.resourceUrl } : {}),
    });
    if (error) throw new Error(error.message);
  });
