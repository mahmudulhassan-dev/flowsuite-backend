export interface JwtPayload {
  userId: string;
  email: string;
  organizationId: string;
  workspaceId: string;
  isSuperAdmin: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
  workspaceId: string;
  isSuperAdmin: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}
