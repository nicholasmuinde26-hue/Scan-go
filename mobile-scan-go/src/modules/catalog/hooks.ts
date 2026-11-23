import { useQuery } from '@tanstack/react-query'; import { catalogApi } from './api';
export const useProducts=(params:{search?:string;storeId?:string;category?:string}={})=>useQuery({queryKey:['catalog',params],queryFn:()=>catalogApi.list(params),enabled:!!params.storeId});
