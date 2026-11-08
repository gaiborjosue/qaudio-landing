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
      admin_chat_sessions: {
        Row: {
          environment: string
          generation: string
          session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          environment: string
          generation?: string
          session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          environment?: string
          generation?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalog_brands: {
        Row: {
          featured: boolean
          logo_path: string | null
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          featured?: boolean
          logo_path?: string | null
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          featured?: boolean
          logo_path?: string | null
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
          scene_path: string
          slug: string
          sort_order: number
          wheel_label: string
        }
        Insert: {
          artwork_path: string
          name: string
          scene_path: string
          slug: string
          sort_order?: number
          wheel_label: string
        }
        Update: {
          artwork_path?: string
          name?: string
          scene_path?: string
          slug?: string
          sort_order?: number
          wheel_label?: string
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
          image_alt: string
          image_height: number | null
          image_path: string | null
          image_width: number | null
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
          image_alt?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
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
          image_alt?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
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
      media_assets: {
        Row: {
          attempts: number
          bucket_id: string
          created_at: string
          expires_at: string
          last_error: string | null
          lease_until: string
          managed: boolean
          owner_id: string | null
          path: string
          sent_at: string | null
          session_id: string | null
          state: string
        }
        Insert: {
          attempts?: number
          bucket_id: string
          created_at?: string
          expires_at?: string
          last_error?: string | null
          lease_until?: string
          managed?: boolean
          owner_id?: string | null
          path: string
          sent_at?: string | null
          session_id?: string | null
          state?: string
        }
        Update: {
          attempts?: number
          bucket_id?: string
          created_at?: string
          expires_at?: string
          last_error?: string | null
          lease_until?: string
          managed?: boolean
          owner_id?: string | null
          path?: string
          sent_at?: string | null
          session_id?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "media_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      media_references: {
        Row: {
          bucket_id: string
          path: string
          record_id: string
          source: string
        }
        Insert: {
          bucket_id: string
          path: string
          record_id: string
          source: string
        }
        Update: {
          bucket_id?: string
          path?: string
          record_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_references_bucket_id_path_fkey"
            columns: ["bucket_id", "path"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["bucket_id", "path"]
          },
        ]
      }
      media_upload_sessions: {
        Row: {
          active_turn: boolean
          ended_at: string | null
          eve_session_id: string | null
          id: string
          last_active_at: string
          owner_id: string
          started_at: string | null
        }
        Insert: {
          active_turn?: boolean
          ended_at?: string | null
          eve_session_id?: string | null
          id?: string
          last_active_at?: string
          owner_id: string
          started_at?: string | null
        }
        Update: {
          active_turn?: boolean
          ended_at?: string | null
          eve_session_id?: string | null
          id?: string
          last_active_at?: string
          owner_id?: string
          started_at?: string | null
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
          caption: string
          height: number
          id: string
          path: string
          product_id: string
          sort_order: number
          width: number
        }
        Insert: {
          alt: string
          caption?: string
          height: number
          id?: string
          path: string
          product_id: string
          sort_order?: number
          width: number
        }
        Update: {
          alt?: string
          caption?: string
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
          availability: string
          brand_slug: string | null
          category_slug: string
          condition: string
          condition_note: string
          created_at: string
          currency: string
          description_closing: string
          description_intro: string
          features: string[]
          id: string
          manufacturer_url: string | null
          msrp_cents: number | null
          name: string
          price_cents: number | null
          price_note: string
          price_unit: string
          ready_for_audition: boolean
          sale_ends_at: string | null
          sale_price_cents: number | null
          sale_starts_at: string | null
          short_description: string
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          availability?: string
          brand_slug?: string | null
          category_slug: string
          condition: string
          condition_note?: string
          created_at?: string
          currency?: string
          description_closing?: string
          description_intro?: string
          features?: string[]
          id?: string
          manufacturer_url?: string | null
          msrp_cents?: number | null
          name: string
          price_cents?: number | null
          price_note?: string
          price_unit?: string
          ready_for_audition?: boolean
          sale_ends_at?: string | null
          sale_price_cents?: number | null
          sale_starts_at?: string | null
          short_description?: string
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          availability?: string
          brand_slug?: string | null
          category_slug?: string
          condition?: string
          condition_note?: string
          created_at?: string
          currency?: string
          description_closing?: string
          description_intro?: string
          features?: string[]
          id?: string
          manufacturer_url?: string | null
          msrp_cents?: number | null
          name?: string
          price_cents?: number | null
          price_note?: string
          price_unit?: string
          ready_for_audition?: boolean
          sale_ends_at?: string | null
          sale_price_cents?: number | null
          sale_starts_at?: string | null
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
      webflow_import_records: {
        Row: {
          applied_at: string
          collection_id: string
          item_id: string
          manifest_sha256: string
          source_sha256: string
          source_slug: string
          target_fingerprint: string
          target_key: string
          target_table: string
        }
        Insert: {
          applied_at?: string
          collection_id: string
          item_id: string
          manifest_sha256: string
          source_sha256: string
          source_slug: string
          target_fingerprint: string
          target_key: string
          target_table: string
        }
        Update: {
          applied_at?: string
          collection_id?: string
          item_id?: string
          manifest_sha256?: string
          source_sha256?: string
          source_slug?: string
          target_fingerprint?: string
          target_key?: string
          target_table?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_chat_session: {
        Args: {
          p_environment: string
          p_event: string
          p_generation?: string
          p_session_id?: string
        }
        Returns: {
          generation: string
          session_id: string
        }[]
      }
      attach_media_uploads: {
        Args: { p_paths: string[]; p_session: string }
        Returns: undefined
      }
      claim_media_cleanup: {
        Args: { p_dry_run?: boolean; p_limit?: number; p_token: string }
        Returns: {
          bucket_id: string
          path: string
        }[]
      }
      complete_media_cleanup: {
        Args: {
          p_bucket: string
          p_path: string
          p_success: boolean
          p_token: string
        }
        Returns: undefined
      }
      discard_media_upload: {
        Args: { p_bucket: string; p_path: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      media_session_event: {
        Args: { p_eve?: string; p_event?: string; p_id: string }
        Returns: string
      }
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
      pin_media_asset: {
        Args: { p_bucket: string; p_path: string }
        Returns: undefined
      }
      prepare_media_copy: {
        Args: { p_bucket: string; p_destination: string; p_path: string }
        Returns: undefined
      }
      register_media_upload: {
        Args: { p_bucket: string; p_path: string; p_session?: string }
        Returns: undefined
      }
      reorder_catalog_metadata: {
        Args: { expected: string[]; kind: string; ordered: string[] }
        Returns: undefined
      }
      set_instagram_media: {
        Args: { p_id: string; p_paths: string[] }
        Returns: undefined
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
