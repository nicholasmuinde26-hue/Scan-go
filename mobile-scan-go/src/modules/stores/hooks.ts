import { useQuery } from '@tanstack/react-query'; import { storesApi } from './api';
export const useStores=()=>useQuery({queryKey:['stores'],queryFn:storesApi.list});
export const useStore=(id:string)=>useQuery({queryKey:['stores',id],queryFn:()=>storesApi.detail(id),enabled:!!id});
