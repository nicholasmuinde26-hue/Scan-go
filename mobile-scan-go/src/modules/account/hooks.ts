import { useQuery } from '@tanstack/react-query'; import { accountApi } from './api';
export const useProfile=()=>useQuery({queryKey:['auth','me'],queryFn:accountApi.profile});
