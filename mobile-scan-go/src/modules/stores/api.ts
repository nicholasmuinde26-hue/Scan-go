import { request } from '../../core/api/client'; import type { Store } from './types';
export const storesApi={list:()=>request<{success:true;stores:Store[]}>('/stores'),detail:(id:string)=>request<{success:true;store:Store}>(`/stores/${id}`)};
