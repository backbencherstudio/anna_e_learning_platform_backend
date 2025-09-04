export class Language {
    id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;

    name: string;
    code: string;

    // Relations
    courses?: any[];
}
