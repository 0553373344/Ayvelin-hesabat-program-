import { Customer } from "../types";

/**
 * Syncs a single Customer to Google Contacts using the People API.
 * If the customer already has a googleContactResourceName, we update the existing contact.
 * Otherwise, we create a new contact.
 */
export async function syncCustomerToGoogleContacts(
  customer: { name: string; phone: string; notes?: string; googleContactResourceName?: string },
  accessToken: string
): Promise<string | null> {
  // Must have a phone number to sync
  if (!customer.phone) return null;

  const bodyData: any = {
    names: [
      {
        givenName: customer.name || "Müştəri"
      }
    ],
    phoneNumbers: [
      {
        value: customer.phone,
        type: "mobile"
      }
    ]
  };

  if (customer.notes) {
    bodyData.biographies = [
      {
        value: customer.notes
      }
    ];
  }

  // Double check if resourceName is already registered on our side
  if (customer.googleContactResourceName) {
    try {
      // First GET to obtain the latest etag (required for updates)
      const getRes = await fetch(`https://people.googleapis.com/v1/${customer.googleContactResourceName}?personFields=names,phoneNumbers,biographies`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (getRes.ok) {
        const currentPerson = await getRes.json();
        bodyData.etag = currentPerson.etag;

        // Perform PATCH update
        const updateRes = await fetch(`https://people.googleapis.com/v1/${customer.googleContactResourceName}?updatePersonFields=names,phoneNumbers,biographies`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyData)
        });

        if (updateRes.ok) {
          const updatedPerson = await updateRes.json();
          return updatedPerson.resourceName;
        } else {
          console.warn(`Update contact failed (${updateRes.status}). Will fall back to duplicate or recreation.`);
        }
      }
    } catch (err) {
      console.warn("Error fetching contact for update, falling back to creating new:", err);
    }
  }

  // Create new contact if not updating
  try {
    const createRes = await fetch("https://people.googleapis.com/v1/people:createContact", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bodyData)
    });

    if (createRes.ok) {
      const createdPerson = await createRes.json();
      return createdPerson.resourceName;
    } else {
      throw new Error(`Google Contacts API error: ${createRes.status} ${createRes.statusText}`);
    }
  } catch (error) {
    console.error(`Error creating Google Contact for ${customer.name}:`, error);
    throw error;
  }
}

/**
 * Deletes a Google Contact using its resource name.
 */
export async function deleteContactFromGoogleContacts(resourceName: string, accessToken: string): Promise<void> {
  try {
    const response = await fetch(`https://people.googleapis.com/v1/${resourceName}:deleteContact`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Contacts API delete error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error deleting Google contact:", error);
  }
}

/**
 * Bulk syncs an array of Customers to Google Contacts.
 */
export async function syncAllCustomersToGoogleContacts(
  customers: Customer[],
  accessToken: string,
  onProgress?: (progress: { current: number; total: number; name: string }) => void
): Promise<{ successCount: number; errorCount: number; updatedCustomers: { customerId: string; resourceName: string }[] }> {
  let successCount = 0;
  let errorCount = 0;
  const updatedCustomers: { customerId: string; resourceName: string }[] = [];

  for (let i = 0; i < customers.length; i++) {
    const cust = customers[i];
    if (!cust.phone) continue;

    if (onProgress) {
      onProgress({ current: i + 1, total: customers.length, name: cust.name });
    }

    try {
      const resourceName = await syncCustomerToGoogleContacts(
        {
          name: cust.name,
          phone: cust.phone,
          notes: cust.notes || `Müştəri statusu: ${cust.isVIP ? "VIP" : "Standart"}, Sifariş sayı: ${cust.orderCount}`,
          googleContactResourceName: (cust as any).googleContactResourceName
        },
        accessToken
      );

      if (resourceName) {
        successCount++;
        updatedCustomers.push({ customerId: cust.id, resourceName });
      } else {
        errorCount++;
      }
    } catch (err) {
      console.error(`Failed to bulk sync customer ${cust.name}:`, err);
      errorCount++;
    }

    // Small rate-limit delay
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { successCount, errorCount, updatedCustomers };
}
