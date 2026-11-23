import { authApi } from '../auth';
export const accountApi={profile:authApi.me,logout:authApi.logout,logoutAll:authApi.logoutAll};
