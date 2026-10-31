export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      catalog_brands: {
        Row: {
          logo_path: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          logo_path: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          logo_path?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      catalog_categories: {
        Row: {
          artwork_path: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          artwork_path: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          artwork_path?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      deal_items: {
        Row: {
          brand: string
          condition: string | null
          created_at: string
          deal_id: string
          id: string
          name: string
          price_cents: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand?: string
          condition?: string | null
          created_at?: string
          deal_id: string
          id?: string
          name: string
          price_cents?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand?: string
          condition?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          name?: string
          price_cents?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          note: string
          sort_order: number
          starts_at: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          note?: string
          sort_order?: number
          starts_at?: string | null
          status?: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          note?: string
          sort_order?: number
          starts_at?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_posts: {
        Row: {
          body: Json
          cover_alt: string
          cover_fit: string
          cover_height: number | null
          cover_path: string | null
          cover_width: number | null
          created_at: string
          excerpt: string
          id: string
          published_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: Json
          cover_alt?: string
          cover_fit?: string
          cover_height?: number | null
          cover_path?: string | null
          cover_width?: number | null
          created_at?: string
          excerpt?: string
          id?: string
          published_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: Json
          cover_alt?: string
          cover_fit?: string
          cover_height?: number | null
          cover_path?: string | null
          cover_width?: number | null
          created_at?: string
          excerpt?: string
          id?: string
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt: string
          height: number
          id: string
          path: string
          product_id: string
          sort_order: number
          width: number
        }
        Insert: {
          alt: string
          height: number
          id?: string
          path: string
          product_id: string
          sort_order?: number
          width: number
        }
        Update: {
          alt?: string
          height?: number
          id?: string
          path?: string
          product_id?: string
          sort_order?: number
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_slug: string
          category_slug: string
          condition: string
          created_at: string
          currency: string
          description_closing: string
          description_intro: string
          features: string[]
          id: string
          manufacturer_url: string | null
          msrp_cents: number | null
          name: string
          price_cents: number
          price_unit: string
          ready_for_audition: boolean
          short_description: string
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          brand_slug: string
          category_slug: string
          condition: string
          created_at?: string
          currency?: string
          description_closing?: string
          description_intro?: string
          features?: string[]
          id?: string
          manufacturer_url?: string | null
          msrp_cents?: number | null
          name: string
          price_cents: number
          price_unit?: string
          ready_for_audition?: boolean
          short_description?: string
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brand_slug?: string
          category_slug?: string
          condition?: string
          created_at?: string
          currency?: string
          description_closing?: string
          description_intro?: string
          features?: string[]
          id?: string
          manufacturer_url?: string | null
          msrp_cents?: number | null
          name?: string
          price_cents?: number
          price_unit?: string
          ready_for_audition?: boolean
          short_description?: string
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_slug_fkey"
            columns: ["brand_slug"]
            isOneToOne: false
            referencedRelation: "catalog_brands"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "products_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      store_hours_changes: {
        Row: {
          closes_at: string | null
          created_at: string
          ends_on: string
          id: string
          kind: string
          note: string
          opens_at: string | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          ends_on: string
          id?: string
          kind: string
          note?: string
          opens_at?: string | null
          starts_on: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          ends_on?: string
          id?: string
          kind?: string
          note?: string
          opens_at?: string | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_weekly_hours: {
        Row: {
          closes_at: string | null
          kind: string
          opens_at: string | null
          updated_at: string
          weekday: number
        }
        Insert: {
          closes_at?: string | null
          kind: string
          opens_at?: string | null
          updated_at?: string
          weekday: number
        }
        Update: {
          closes_at?: string | null
          kind?: string
          opens_at?: string | null
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      news_feed: {
        Args: {
          after_id?: string
          after_published_at?: string
          max_rows?: number
        }
        Returns: {
          cover_alt: string
          cover_fit: string
          cover_height: number
          cover_path: string
          cover_width: number
          excerpt: string
          id: string
          published_at: string
          slug: string
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
