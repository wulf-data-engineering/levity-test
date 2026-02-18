import { toast } from 'svelte-sonner';

export function toastError(text: string, description: string) {
	toast.error(text, { description, richColors: true, duration: 5000 });
}

export function toastSuccess(text: string, description: string) {
	toast.success(text, { description, duration: 3000 });
}
