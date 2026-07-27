export interface AuthContext {
  userId: string;
  clientId: string | null; // null = владелец платформы
  role: string; // owner | client_admin | client_staff
  email: string | null;
}

export interface JwtPayload {
  sub: string; // userId
  cid: string | null; // clientId
  role: string;
  email: string | null;
}
